"""Owner review screenshots for the formal MOBA skill HUD and talent picker."""
from pathlib import Path
import json
import os
import time
from playwright.sync_api import sync_playwright

URL = os.environ.get('ESMO_BROWSER_URL', 'http://127.0.0.1:5173/ESMO-/')
OUT = Path("tmp/moba-skill-talent-owner-review")
OUT.mkdir(parents=True, exist_ok=True)

def inspect(page):
    return page.evaluate("""() => ({
      buttons: [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width > 0).map(b => ({
        text: (b.innerText || '').trim().slice(0, 60), testid: b.dataset.testid || '', disabled: b.disabled
      })).slice(0, 24),
      skillCount: document.querySelectorAll('[data-skill-slot]').length,
      talentPicker: !!document.querySelector('[data-battle-talent-picker]'),
      detail: !!document.querySelector('[data-skill-detail]')
    })""")

def visible(page, selector):
    return page.evaluate("s => [...document.querySelectorAll(s)].some(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })", selector)

def click_text(page, text):
    return page.evaluate("t => { const b = [...document.querySelectorAll('button')].find(x => x.getBoundingClientRect().width > 0 && !x.disabled && (x.innerText || '').includes(t)); if (b) b.click(); return !!b; }", text)

def enter_battle(page, label):
    chosen_talent = None
    page.goto(URL, wait_until="domcontentloaded")
    page.evaluate("""async () => {
      const { useProfileStore } = await import('/ESMO-/src/platform/profileStore.js');
      useProfileStore.getState().startNewGame('elite');
      useProfileStore.getState().save();
    }""")
    page.reload(wait_until="domcontentloaded")
    page.locator('[data-testid="home-mode-moba"]').wait_for(timeout=90000)
    page.locator('[data-testid="home-mode-moba"]').click()
    deadline = time.monotonic() + 150
    while time.monotonic() < deadline and not visible(page, '[data-testid="hero-grid-scroll"]'):
        if visible(page, '[data-testid="matchmaking-enter-banpick"]'):
            page.locator('[data-testid="matchmaking-enter-banpick"]').click()
        elif visible(page, '[data-testid="prep-primary-action"]'):
            a = page.locator('[data-testid="prep-primary-action"]')
            if a.get_attribute('data-action') == 'blocked':
                click_text(page, '自動')
            elif a.is_enabled():
                a.click()
        page.wait_for_timeout(900)
    assert visible(page, '[data-testid="hero-grid-scroll"]'), f"{label} not in banpick: {inspect(page)}"
    deadline = time.monotonic() + 150
    while time.monotonic() < deadline:
        if visible(page, '[data-testid="confirm-draft"]') and page.locator('[data-testid="confirm-draft"]').is_enabled():
            page.locator('[data-testid="confirm-draft"]').click()
            break
        page.evaluate("""() => { const h = [...document.querySelectorAll('[data-testid="hero-choose"]')]
          .find(e => e.getBoundingClientRect().width > 0); if (h) for (const type of
          ['pointerdown','mousedown','pointerup','mouseup','click']) h.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true})); }""")
        page.wait_for_timeout(1100)
    assert visible(page, '[data-battle-talent-picker]') or click_text(page, '開始載入'), f"{label} tactic failed: {inspect(page)}"
    if visible(page, '[data-battle-talent-picker]'):
        page.locator('[data-battle-talent-picker]').evaluate('(e) => e.open = true')
        page.screenshot(path=str(OUT / f'{label}-talent-picker.png'), full_page=True)
        options = page.locator('[data-talent-id]')
        assert options.count() >= 2
        options.first.click()
        assert options.first.get_attribute('aria-pressed') == 'true'
        chosen_talent = options.first.get_attribute('data-talent-id')
        click_text(page, '開始載入')
    deadline = time.monotonic() + 150
    while time.monotonic() < deadline and not visible(page, '[data-testid="observer-dock"]'):
        page.evaluate("""() => { const b = [...document.querySelectorAll('button')]
          .find(x => x.getBoundingClientRect().width > 0 && !x.disabled && /開始|進入|繼續/.test(x.innerText || ''));
          b?.click(); }""")
        page.wait_for_timeout(700)
    assert visible(page, '[data-testid="observer-dock"]'), f"{label} battle failed: {inspect(page)}"
    return chosen_talent

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    report = {}
    for label, width, height, mobile in [('desktop', 1366, 900, False), ('mobile', 390, 844, True)]:
        context = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=mobile,
                                      device_scale_factor=2 if mobile else 1)
        page = context.new_page()
        page.set_default_navigation_timeout(90000)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        try:
            chosen_talent = enter_battle(page, label)
            if chosen_talent:
                active_talents = page.evaluate("""async () => {
                  const { useGameStore } = await import('/ESMO-/src/useGameStore.js');
                  return (useGameStore.getState().snapshot?.players ?? []).map(p => p.heroBattleTalent?.id).filter(Boolean);
                }""")
                assert chosen_talent in active_talents, f'{label} selected talent did not reach authoritative snapshot'
            page.screenshot(path=str(OUT / f'{label}-battle-skill-bar.png'))
            icons = page.locator('[data-skill-slot]')
            assert icons.count() == 5
            assert all(icons.nth(i).locator('img').count() == 1 for i in range(5))
            for slot in ['P', 'Q', 'W', 'E', 'R']:
                page.locator(f'[data-skill-slot="{slot}"]').click()
                detail = page.locator('[data-skill-detail]')
                detail.wait_for(timeout=10000)
                assert detail.get_attribute('data-skill-detail').endswith(f':{slot}')
                if slot == 'P':
                    assert '不會在本場觸發' in detail.inner_text()
                if slot == 'Q':
                    assert '實戰效果以以下正式規則為準' in detail.inner_text()
                    page.screenshot(path=str(OUT / f'{label}-skill-detail.png'))
                page.locator('.observer-skill-detail-head button').click()
            page.locator('.observer-identity').click()
            assert page.locator('[data-skill-slot]').count() == 10, 'hero sheet must also show five skills'
            page.locator('[data-skill-slot="Q"]').last.click()
            page.locator('[data-skill-detail]').wait_for(timeout=10000)
            page.screenshot(path=str(OUT / f'{label}-hero-sheet-skill.png'))
            overflow = page.evaluate('document.documentElement.scrollWidth > innerWidth')
            assert not overflow, f'{label} horizontal overflow'
            mobile_widths = {}
            if mobile:
                for viewport_width in [320, 360, 390, 430]:
                    page.set_viewport_size({'width': viewport_width, 'height': height})
                    page.wait_for_timeout(250)
                    mobile_widths[str(viewport_width)] = page.evaluate('document.documentElement.scrollWidth > innerWidth')
                assert not any(mobile_widths.values()), f'{label} viewport overflow: {mobile_widths}'
            assert not errors, f'{label} browser errors: {errors[:4]}'
            report[label] = {'hudIcons': 5, 'heroSheetIcons': 5, 'details': 6,
                             'chosenTalentReachedSnapshot': bool(chosen_talent), 'overflow': overflow,
                             'mobileWidthsOverflow': mobile_widths,
                             'pageConsoleErrors': len(errors),
                             'shaderErrors': len([e for e in errors if any(t in e.lower() for t in ['shader', 'glsl', 'webgl'])]),
                             'errors': errors}
        except Exception as e:
            page.screenshot(path=str(OUT / f'{label}-failure.png'), full_page=True)
            report[label] = {'error': str(e), 'state': inspect(page), 'browserErrors': errors[:5]}
        finally:
            context.close()
    browser.close()

(OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
assert all('error' not in row for row in report.values())
