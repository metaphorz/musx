#!/usr/bin/env python
"""Generate the manual's figures by driving MusX in headless Chrome via Selenium.

Run the static server first (../start), then:  venv/bin/python docs/make_figures.py
Figures are written to docs/figures/*.png and referenced from manual.tex.
"""
import os
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

PORT = os.environ.get("MUSX_PORT", "8137")
URL = f"http://localhost:{PORT}/index.html"
FIG = os.path.join(os.path.dirname(__file__), "figures")
os.makedirs(FIG, exist_ok=True)

opts = Options()
opts.add_argument("--headless=new")
opts.add_argument("--window-size=1120,700")
opts.add_argument("--autoplay-policy=no-user-gesture-required")  # let Tone.start() unlock audio
opts.add_argument("--force-device-scale-factor=1")
driver = webdriver.Chrome(options=opts)


def fresh():
    driver.get(URL)
    WebDriverWait(driver, 10).until(lambda d: d.execute_script("return !!window.editor"))


def start_audio():
    driver.find_element(By.ID, "btn-audio").click()
    time.sleep(0.3)


def play():
    driver.find_element(By.ID, "btn-play").click()


def shot(name):
    time.sleep(0.7)  # let scopes/animations settle
    path = os.path.join(FIG, f"{name}.png")
    driver.save_screenshot(path)
    print("wrote", path)


def demo(key):
    driver.execute_script("window.editor.loadDemo(arguments[0]);", key)


# fig:interface — overview (XY-pad subtractive synth, drone is audible so the scope draws)
fresh(); demo("xySynth"); start_audio(); shot("interface")

# fig:custom-synth — patch 1 recreation (sequencer-driven)
fresh(); demo("customSynth"); start_audio(); play(); shot("custom-synth")

# fig:layered-pad — patch 3 recreation (continuous drone)
fresh(); demo("layeredPad"); start_audio(); shot("layered-pad")

# fig:funcgen-plot — algebraic function generator -> plot + scope
fresh(); demo("funcPlot"); start_audio(); play(); shot("funcgen-plot")

# fig:bang-code — bang / message / code objects
fresh(); demo("bangCode"); start_audio()
driver.find_element(By.CSS_SELECTOR, ".msg-btn").click(); time.sleep(0.1)
driver.find_element(By.CSS_SELECTOR, ".bang-btn").click()
shot("bang-code")

# fig:note-labels — frequency->note display + keyboard octave labels
fresh()
driver.execute_script(
    """
    const g = window.editor.graph;
    g.addNode('osc', 60, 40, {wave:'sine', freq:440});
    g.addNode('osc', 60, 230, {wave:'sawtooth', freq:261.63});
    g.addNode('osc', 380, 40, {wave:'sine', freq:333});
    g.addNode('filter', 380, 230, {cutoff:1760});
    g.addNode('note', 720, 40, {midi:57});
    g.addNode('keyboard', 720, 230, {});
    """
)
shot("note-labels")

# fig:context-menu — two-level add-object menu
fresh()
driver.execute_script(
    """
    const c = document.getElementById('canvas');
    c.dispatchEvent(new MouseEvent('contextmenu', {clientX:360, clientY:230, bubbles:true}));
    document.querySelector('.ctxmenu .cat-item .submenu').style.display = 'block';
    """
)
shot("context-menu")

# fig:source-nodes — Phase 2.1 CDP input side: sndfile~ + mic~ feeding an effect chain
fresh()
driver.execute_script(
    """
    const g = window.editor.graph;
    const s = g.addNode('sndfile', 60, 40, {loop:'on', rate:1, filename:'voice.wav'});
    const m = g.addNode('mic', 60, 300, {});
    const f = g.addNode('filter', 420, 60, {type:'bandpass', cutoff:900, Q:4});
    const r = g.addNode('reverb', 420, 300, {decay:3, wet:0.5});
    const d = g.addNode('dac', 760, 180, {});
    g.addConnection({nodeId:s.id,port:'out'},{nodeId:f.id,port:'in'},'audio');
    g.addConnection({nodeId:m.id,port:'out'},{nodeId:r.id,port:'in'},'audio');
    g.addConnection({nodeId:f.id,port:'out'},{nodeId:d.id,port:'in'},'audio');
    g.addConnection({nodeId:r.id,port:'out'},{nodeId:d.id,port:'in'},'audio');
    """
)
shot("source-nodes")

# fig:granular-cloud — Phase 2.2 granular family (grain~ + pshift~ into a shared reverb)
fresh()
driver.execute_async_script(
    """
    const done = arguments[arguments.length - 1];
    fetch('/patches/granular/granular-cloud.json').then(r => r.json()).then(d => {
      window.editor.graph.loadJSON(d); done(1);
    });
    """
)
start_audio()
time.sleep(2.0)  # let the bundled sounds auto-load so the scope draws
shot("granular-cloud")

# fig:waveset-crunch — Phase 2.3 waveset distortion (sndfile~ -> wsdistort~ -> dac~ +scope)
fresh()
driver.execute_async_script(
    """
    const done = arguments[arguments.length - 1];
    fetch('/patches/cdp/waveset-crunch.json').then(r => r.json()).then(d => {
      window.editor.graph.loadJSON(d); done(1);
    });
    """
)
start_audio()
time.sleep(2.0)  # let drone.wav auto-load so the scope draws the crunched waveform
shot("waveset-crunch")

# fig:spectral-stretch — Phase 2.4 spectral partial-stretch (sndfile~ -> spec.stretch~ -> reverb~)
fresh()
driver.execute_async_script(
    """
    const done = arguments[arguments.length - 1];
    fetch('/patches/cdp/spectral-stretch.json').then(r => r.json()).then(d => {
      window.editor.graph.loadJSON(d); done(1);
    });
    """
)
start_audio()
time.sleep(2.0)  # let drone.wav auto-load so the scope draws the stretched spectrum
shot("spectral-stretch")

# fig:env-impose — Phase 2.5 envelope pair (envfollow~ of glass-hits opens a pad's envimpose~ VCA)
fresh()
driver.execute_async_script(
    """
    const done = arguments[arguments.length - 1];
    fetch('/patches/cdp/env-impose.json').then(r => r.json()).then(d => {
      window.editor.graph.loadJSON(d); done(1);
    });
    """
)
start_audio()
time.sleep(2.0)
shot("env-impose")

driver.quit()
print("done")
