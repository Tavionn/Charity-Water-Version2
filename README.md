# Flow Quest — a charity: water game

*Water for a Brighter Tomorrow*

A browser game prototype built with HTML, CSS, and JavaScript for the charity: water game project. It works on desktop and mobile.

## Play

Open `index.html` in any web browser. No installs or build steps are needed.

## Two roles

**Villager:** living without clean water nearby
- Catch clean rain drops to fill your jerry can (10 max).
- Avoid polluted drops (−20 points and a heart).
- Take your can to the biosand filter on the bridge to purify it and fill the village tank.
- Pick up litter for a cleanup bonus.
- Stay out of the Restricted Area (−25 points and a heart).
- Fill the tank to 100 to level up. Clear level 5 to win.

**Warehouse Volunteer:** packing water for delivery
- Grab cases from the conveyor belt (carry up to 3).
- Load the truck before its timer runs out.
- Put leaking cases in the recycling bin. Loading one costs 30 points.
- Jump over the forklift (−25 points, and you drop your cases).
- Mop up spills that slow you down.
- Send 5 full trucks to win.

## Controls

| Action | Keyboard | Touch / mouse |
|---|---|---|
| Move | ← → or A D | ← → buttons |
| Jump | ↑, W, or Space | ↑ button |
| Interact | E or Enter | Hand button |
| Pause | P or Esc | Menu (☰) |
| Restart | — | Reset button in the header |

## On phones

- **Held upright:** the camera zooms in and follows your character through the full-size level. A mini-map along the bottom shows the whole level and what's on screen, and a gold arrow on the screen edge points to your next goal when it's off screen.
- **Turned sideways:** the game fills the screen under one slim header row, and the buttons float over the game (← → on the left, ↑ and the hand on the right).
- **No accidental zoom:** tapping the buttons quickly won't zoom the page. Pinch-to-zoom still works for anyone who needs it.
- **Fast on phones:** fonts load in the background, the scenery that never moves is drawn once and reused, the canvas uses a lighter resolution on touch screens, and the scene redraws more slowly behind menus to save battery.

## Languages

Use the globe menu in the header to pick one of 29 languages:

English · Español · Français · Português · Deutsch · Italiano · Nederlands · Polski · Kiswahili · Hausa · Yorùbá · አማርኛ · Türkçe · Bahasa Indonesia · Filipino · Tiếng Việt · Русский · Українська · हिन्दी · বাংলা · नेपाली · ไทย · 中文 · 日本語 · 한국어 · **العربية · עברית · فارسی · اردو**

Amharic, Bengali, Hausa, Yoruba, and Nepali are spoken in countries where charity: water funds projects, such as Ethiopia, Bangladesh, Nigeria, and Nepal.

The game adapts to how each language is read:

- **Direction is automatic.** The browser reports each language's reading direction (with a built-in backup list), so right-to-left languages (Arabic, Hebrew, Persian, Urdu) set `dir="rtl"` and mirror the header, panels, progress steps, and the game world, while every other language stays left to right. The arrow keys always move you the way they point.
- **Everything is translated**, including the signs and labels drawn inside the game scene.
- **First visit:** the game uses your browser's language if it's in the list. After that it remembers your choice.

English is built into `i18n.js`. Each other language is one file in `lang/` (for example `lang/es.js`) that loads only when it's picked.

**Adding a language:** copy `lang/es.js` to `lang/<code>.js`, translate the text on the right (keep every `{placeholder}` and `<b>`/`<kbd>` tag), and add one line to `LANGUAGES` in `i18n.js`. Its reading direction is detected automatically.

The translations were written with AI help. Ideally a native speaker should review each one before the game is used publicly.

## Extra credit (LevelUp)

- **Challenge that reduces score:** polluted drops, the Restricted Area, the forklift, and leaking cases all cost points.
- **Game reset:** a Reset button in the header restarts the current game at any time.
- **Celebrate wins:** a confetti burst plays when you win, with smaller bursts on level-ups.

## Files

- `index.html`: page layout (header, game area, control panels, menus)
- `style.css`: styling and the responsive layout for desktop and mobile
- `script.js`: game logic and canvas drawing
- `i18n.js`: language list, English text, reading-direction detection, and language switching
- `lang/*.js`: one translation file per language

Learn more about clean water at [charitywater.org](https://www.charitywater.org).
