"""Selenium check for the CDP-style example patches in patches/.

For each patch: load the JSON, assert DOM parity (boxes==nodes, cables==connections)
and no page errors. Then prove signal flows through the whole chain — inject a test
buffer into sndfile~ and read the master meter; for the mic patch, assert mic opened.

Run:  source venv/bin/activate && python tests/auto/verify_patches.py [port]
(./start <port> must already be serving.)
"""
import sys
import time
from musx_driver import make_driver, open_app, start_audio, master_peak

PORT = sys.argv[1] if len(sys.argv) > 1 else "8123"
fails = 0

SND_PATCHES = ["cdp/concrete-resonator", "cdp/dub-smear", "cdp/waveset-crunch",
               "cdp/spectral-blur", "granular/granular-cloud"]
MIC_PATCHES = ["cdp/mic-resonator", "live/mic-monitor"]


def check(name, ok, detail=""):
    global fails
    if not ok:
        fails += 1
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}  {detail}")


driver = make_driver(headless=True)
driver.set_script_timeout(15)
try:
    for key in SND_PATCHES + MIC_PATCHES:
        open_app(driver, PORT)
        # load the patch file into the graph (async: fetch + parse)
        counts = driver.execute_async_script("""
            const done = arguments[arguments.length - 1];
            fetch('/patches/' + arguments[0] + '.json')
              .then(r => r.json())
              .then(data => {
                window.editor.graph.loadJSON(data);
                done({
                  nodes: window.editor.graph.nodes.size,
                  conns: window.editor.graph.connections.size,
                  boxes: document.querySelectorAll('#nodes .node').length,
                  cables: document.querySelectorAll('#cables path.cable').length
                });
              }).catch(e => done({error: String(e)}));
        """, key)
        if counts.get("error"):
            check(f"{key}: loads", False, counts["error"]); continue
        parity = (counts["boxes"] == counts["nodes"]) and (counts["cables"] == counts["conns"])
        check(f"{key}: DOM parity", parity,
              f"({counts['nodes']} nodes/{counts['boxes']} boxes, {counts['conns']} conns/{counts['cables']} cables)")

        start_audio(driver)
        driver.find_element("id", "btn-play").click()

        if key in SND_PATCHES:
            # the patch auto-loads a bundled sound from sounds/ on Start Audio; wait for the
            # WAV to fetch+decode+start (loop), then confirm real signal through the chain.
            time.sleep(2.0)
            peak = master_peak(driver, 1.2)
            loaded = driver.execute_script("""
                const bufTypes = ['sndfile','grain','tstretch','pshift'];
                const src = [...window.editor.graph.nodes.values()].find(x=>bufTypes.includes(x.type));
                return !!(src && src._audio);
            """)
            check(f"{key}: auto-loads bundled sound", loaded)
            check(f"{key}: signal through chain", peak > -60, f"({peak:.1f} dB)")
        else:
            time.sleep(1.2)
            status = driver.execute_script(
                "return document.querySelector('.readout[data-name=status]')?.textContent;")
            check(f"{key}: mic opens", status == "on", f"(status={status})")

    # collect any JS errors surfaced on the page
    logs = driver.get_log("browser") if "browser" in driver.log_types else []
    js_errors = [l for l in logs if l["level"] == "SEVERE" and ".json" not in l["message"]]
    check("no severe JS errors", len(js_errors) == 0, f"({len(js_errors)} found)")
finally:
    driver.quit()

print(f"\n==== {'ALL PATCHES OK' if fails == 0 else str(fails) + ' FAILURE(S)'} ====")
sys.exit(1 if fails else 0)
