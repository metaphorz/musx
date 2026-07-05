"""Selenium UI + audio test for MusX (preferred over Playwright per project decision).

Verifies: page boots, nodes render in the DOM, and patches produce real signal
(read off the master meter in dB). Covers the existing demos plus the new Phase 2.1
source nodes (sndfile~ playing a synthesized buffer, mic~ opening the input stream).

Run:  source venv/bin/activate && python tests/auto/ui_test.py [port]
(Assumes ./start <port> is already serving the app.)
"""
import sys
import time
from musx_driver import make_driver, open_app, start_audio, master_peak

PORT = sys.argv[1] if len(sys.argv) > 1 else "8123"
fails = 0


def check(name, ok, detail=""):
    global fails
    status = "PASS" if ok else "FAIL"
    if not ok:
        fails += 1
    print(f"  [{status}] {name}  {detail}")


driver = make_driver(headless=True)
try:
    # 1) base load + node rendering
    open_app(driver, PORT)
    counts = driver.execute_script("""
        const g = window.editor.graph;
        const o = g.addNode('osc', 60, 60, {wave:'sine', freq:330});
        const d = g.addNode('dac', 380, 60, {});
        g.addConnection({nodeId:o.id,port:'out'},{nodeId:d.id,port:'in'},'audio');
        return {nodes: g.nodes.size,
                boxes: document.querySelectorAll('#nodes .node').length,
                cables: document.querySelectorAll('#cables path.cable').length};
    """)
    check("nodes render in DOM", counts["boxes"] == counts["nodes"] and counts["cables"] == 1,
          f"(boxes={counts['boxes']}, cables={counts['cables']})")

    # 2) osc -> dac makes sound
    start_audio(driver)
    driver.find_element("id", "btn-play").click()
    peak = master_peak(driver, 1.0)
    check("osc~ -> dac~ audible", peak > -60, f"({peak:.1f} dB)")

    # 3) sndfile~ plays a synthesized buffer (Phase 2.1)
    open_app(driver, PORT)
    driver.execute_script("""
        const g = window.editor.graph;
        const s = g.addNode('sndfile', 60, 60, {});
        const d = g.addNode('dac', 380, 60, {});
        g.addConnection({nodeId:s.id,port:'out'},{nodeId:d.id,port:'in'},'audio');
        window.__sndId = s.id;
    """)
    start_audio(driver)
    driver.execute_script("""
        const Tone = window.Tone;
        const sr = Tone.getContext().sampleRate, n = sr;
        const arr = new Float32Array(n);
        for (let i=0;i<n;i++) arr[i] = 0.6*Math.sin(2*Math.PI*220*i/sr);
        const buf = Tone.ToneAudioBuffer.fromArray(arr);
        const rt = window.editor.engine.runtimes.get(window.__sndId);
        rt.setBuffer(buf); rt.play();
    """)
    peak = master_peak(driver, 0.9)
    check("sndfile~ plays a buffer", peak > -60, f"({peak:.1f} dB)")

    # 4) mic~ opens the input stream (fake device is silent headless, so assert open state)
    open_app(driver, PORT)
    driver.execute_script("""
        const g = window.editor.graph;
        const m = g.addNode('mic', 60, 60, {});
        const d = g.addNode('dac', 380, 60, {});
        g.addConnection({nodeId:m.id,port:'out'},{nodeId:d.id,port:'in'},'audio');
    """)
    start_audio(driver)
    time.sleep(1.5)
    status = driver.execute_script(
        "return document.querySelector('.readout[data-name=status]')?.textContent;")
    check("mic~ opens input stream", status == "on", f"(status={status})")

finally:
    driver.quit()

print(f"\n==== {'ALL UI TESTS PASSED' if fails == 0 else str(fails) + ' FAILURE(S)'} ====")
sys.exit(1 if fails else 0)
