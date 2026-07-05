"""Selenium test for canvas pan / zoom / fit-to-view.

Run:  source venv/bin/activate && python tests/auto/panzoom_test.py [port]
(./start <port> must already be serving.)
"""
import sys
import time
from musx_driver import make_driver, open_app

PORT = sys.argv[1] if len(sys.argv) > 1 else "8123"
fails = 0


def check(name, ok, detail=""):
    global fails
    if not ok:
        fails += 1
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}  {detail}")


driver = make_driver(headless=True, width=1200, height=760)
driver.set_script_timeout(15)
try:
    open_app(driver, PORT)
    # load the widest patch (mic-resonator spans x up to ~2100)
    driver.execute_async_script("""
        const done = arguments[arguments.length - 1];
        fetch('/patches/cdp/mic-resonator.json').then(r=>r.json()).then(d=>{
          window.editor.graph.loadJSON(d); done(1);
        }).catch(e=>done(1));
    """)
    time.sleep(0.5)  # let fitView (rAF) settle

    # 1) fit-on-load: every node box lies inside the canvas viewport
    inside = driver.execute_script("""
        const c = document.getElementById('canvas').getBoundingClientRect();
        const boxes = [...document.querySelectorAll('#nodes .node')];
        const tol = 2;
        const allIn = boxes.every(b => { const r = b.getBoundingClientRect();
            return r.left >= c.left - tol && r.right <= c.right + tol &&
                   r.top  >= c.top  - tol && r.bottom<= c.bottom+ tol; });
        return { allIn, n: boxes.length, z: window.editor.vp.z };
    """)
    check("fit-on-load frames all nodes", inside["allIn"],
          f"({inside['n']} boxes, zoom={inside['z']:.2f})")

    # 2) wheel zooms in around the cursor
    z0 = driver.execute_script("return window.editor.vp.z;")
    driver.execute_script("""
        const c=document.getElementById('canvas'), r=c.getBoundingClientRect();
        c.dispatchEvent(new WheelEvent('wheel',{deltaY:-240,clientX:r.left+r.width/2,clientY:r.top+r.height/2,bubbles:true,cancelable:true}));
    """)
    z1 = driver.execute_script("return window.editor.vp.z;")
    check("wheel zooms in", z1 > z0 + 0.05, f"({z0:.2f} -> {z1:.2f})")

    # 3) dragging empty canvas pans the view
    driver.execute_script("window.editor.resetView();")
    driver.execute_script("""
        const c=document.getElementById('canvas'), r=c.getBoundingClientRect();
        c.dispatchEvent(new MouseEvent('mousedown',{clientX:r.left+40,clientY:r.top+40,button:0,bubbles:true}));
        document.dispatchEvent(new MouseEvent('mousemove',{clientX:r.left+160,clientY:r.top+110,bubbles:true}));
        document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    """)
    pan = driver.execute_script("return {x:window.editor.vp.x,y:window.editor.vp.y};")
    check("drag pans canvas", abs(pan["x"] - 120) < 3 and abs(pan["y"] - 70) < 3,
          f"(pan={pan['x']:.0f},{pan['y']:.0f} expect ~120,70)")

    # 4) node drag tracks the cursor 1:1 under zoom (screen delta / zoom = world delta)
    driver.execute_script("window.editor.vp={x:0,y:0,z:0.5}; window.editor.applyViewport();")
    res = driver.execute_script("""
        const node = [...window.editor.graph.nodes.values()][0];
        const before = node.x;
        const view = window.editor.views.get(node.id);
        const tb = view.el.querySelector('.titlebar');
        const r = tb.getBoundingClientRect();
        const cx = r.left + 10, cy = r.top + 8;
        tb.dispatchEvent(new MouseEvent('mousedown',{clientX:cx,clientY:cy,button:0,bubbles:true}));
        document.dispatchEvent(new MouseEvent('mousemove',{clientX:cx+100,clientY:cy,bubbles:true}));
        document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
        return { before, after: node.x };
    """)
    dx = res["after"] - res["before"]
    check("node drag 1:1 under 0.5x zoom", abs(dx - 200) < 6,
          f"(moved {dx:.0f} world px for 100 screen px @0.5x, expect ~200)")
finally:
    driver.quit()

print(f"\n==== {'PAN/ZOOM OK' if fails == 0 else str(fails) + ' FAILURE(S)'} ====")
sys.exit(1 if fails else 0)
