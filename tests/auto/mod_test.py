"""Selenium test for modulatable parameters (params marked `mod: true`).

Verifies (1) each mod param renders an auto control inlet, and (2) a control value
arriving at that inlet is routed to the runtime's setParam().

Run:  source venv/bin/activate && python tests/auto/mod_test.py [port]
"""
import sys
from musx_driver import make_driver, open_app, start_audio

PORT = sys.argv[1] if len(sys.argv) > 1 else "8123"
fails = 0


def check(name, ok, detail=""):
    global fails
    if not ok:
        fails += 1
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}  {detail}")


driver = make_driver(headless=True)
try:
    # 1) auto control inlets appear for mod params
    open_app(driver, PORT)
    counts = driver.execute_script("""
        const g = window.editor.graph;
        const s = g.addNode('sndfile', 60, 60, {});
        const gr = g.addNode('grain', 400, 60, {});
        const inlets = (id) => window.editor.views.get(id).el
            .querySelectorAll('.ports.in .port.control').length;
        return { snd: inlets(s.id), grain: inlets(gr.id) };
    """)
    # sndfile: trig + rate = 2 ; grain: trig + grain + overlap + rate + pitch = 5
    check("sndfile~ auto inlets (trig+rate)", counts["snd"] == 2, f"(={counts['snd']})")
    check("grain~ auto inlets (trig+grain+overlap+rate+pitch)", counts["grain"] == 5, f"(={counts['grain']})")

    # 2) a control value at a mod inlet routes to setParam
    open_app(driver, PORT)
    routed = driver.execute_script("""
        const g = window.editor.graph;
        const f = g.addNode('funcgen', 60, 60, {});
        const s = g.addNode('sndfile', 400, 60, {});
        g.addConnection({nodeId:f.id,port:'val'},{nodeId:s.id,port:'rate'},'control');
        window.__f = f.id; window.__s = s.id;
        return true;
    """)
    start_audio(driver)
    spy = driver.execute_script("""
        const s = window.editor.engine.runtimes.get(window.__s);
        let got = null; const orig = s.setParam.bind(s);
        s.setParam = (n, v) => { got = {n, v}; orig(n, v); };
        window.editor.engine._emit(window.__f, 'val', 1.7); // funcgen 'val' -> sndfile 'rate'
        return got;
    """)
    check("mod inlet routes to setParam", spy and spy["n"] == "rate" and abs(spy["v"] - 1.7) < 1e-6,
          f"({spy})")
finally:
    driver.quit()

print(f"\n==== {'MOD PARAMS OK' if fails == 0 else str(fails) + ' FAILURE(S)'} ====")
sys.exit(1 if fails else 0)
