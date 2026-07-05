"""Shared Selenium helpers for driving the MusX node patcher.

Boots Chrome (headless by default) with Web Audio unlocked and a fake media device so
mic~ can open. Reuse across UI tests (tests/auto/) and figure generation (docs/).
Selenium Manager auto-downloads a matching chromedriver on first run.
"""
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait


def make_driver(headless=True, width=1400, height=900):
    opts = Options()
    if headless:
        opts.add_argument("--headless=new")
    # Web Audio + fake mic so the app runs without a user gesture or real device.
    opts.add_argument("--autoplay-policy=no-user-gesture-required")
    opts.add_argument("--use-fake-ui-for-media-stream")
    opts.add_argument("--use-fake-device-for-media-stream")
    opts.add_argument(f"--window-size={width},{height}")
    opts.add_argument("--force-device-scale-factor=2")  # crisp figures (retina-quality)
    driver = webdriver.Chrome(options=opts)
    driver.set_window_size(width, height)
    return driver


def open_app(driver, port, path="index.html"):
    driver.get(f"http://localhost:{port}/{path}")
    WebDriverWait(driver, 15).until(
        lambda d: d.execute_script("return !!(window.editor && window.Tone);")
    )


def start_audio(driver, settle=0.4):
    """Click Start Audio (the required first gesture) and wait for engine.start()."""
    driver.find_element("id", "btn-audio").click()
    WebDriverWait(driver, 15).until(
        lambda d: d.execute_script("return window.editor.engine.started === true;")
    )
    time.sleep(settle)


def master_peak(driver, seconds=1.0, step=0.06):
    """Sample the master meter and return the loudest dB reading (proves real signal)."""
    driver.execute_script("window.editor.masterLevel();")  # lazily create the meter
    peak = -999.0
    n = int(seconds / step)
    for _ in range(n):
        time.sleep(step)
        v = driver.execute_script(
            "var v = window.editor.masterLevel();"
            "return Number.isFinite(v) ? v : -999;"
        )
        if v is not None and v > peak:
            peak = v
    return peak
