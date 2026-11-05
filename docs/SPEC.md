# Product specification

**Who:** teens aged 12-15, playing in a browser on a laptop, tablet or phone, at home or in class.
**Goal:** they come out able to say what each main immune cell does and why the body needs several kinds, because the game only rewards using each cell for what it is really good at.
**Rules for all content:** fun first, honest always. On-screen words are immune-system words (no "tower", "magic", "armour"). Where the game bends real biology for play, an "In reality" note says how.

Work is tracked as [GitHub issues](https://github.com/alexisdacquay/immune-citadel-v4/issues); each issue carries its own acceptance criteria. Below are the player journeys the game must support.

## 1. First play

A new player can start and understand the first level without reading instructions.

- [ ] The title screen opens on specimen 01 with no save needed.
- [ ] Field notes appear one at a time, next to what they point at and never over it: where to grow a cell, how to call a wave, later how to upgrade.
- [ ] The first time any pathogen appears, the game pauses on its intro card.
- [ ] A first-time player has only the neutrophil: no hero and no abilities until they unlock.

## 2. The campaign

The player progresses through 18 levels in six body places (skin, lungs, blood, lymph node, gut, brain), three per place, each on its own map.

- [ ] Winning a level unlocks the next; losing lets the player retry.
- [ ] A win earns 1 to 3 stars, depending on the vitality left; the result screen says what the next star needs.
- [ ] Cells, abilities and the hero unlock at fixed levels, so each level adds little that is new.
- [ ] Every level can be won with the cells unlocked by then (checked by a bot that plays every level).

## 3. Field Guide and Memory

- [ ] Every cell and pathogen met gets a plate in the Field Guide, with what it is, how it fights or harms, and the real biology.
- [ ] Stars buy Memory upgrades that last across levels.

## 4. Challenges

- [ ] The last level of each body place offers two harder variants, Acute and Chronic, once the full set of cells is unlocked.
- [ ] Challenge results are kept separately from campaign stars.

## 5. Saves on several devices

Progress follows the player from one device to another without an account.

- [ ] Progress is saved in the browser after every change and survives a reload.
- [ ] The first save also creates a 16-character save code and stores a copy in the cloud; the cloud panel shows the code.
- [ ] Typing that code on another device loads the progress there; the two devices' progress is merged (best stars, everything seen), never overwritten.
- [ ] Without the cloud (offline, or the API down), the game plays and saves locally, and the cloud panel says that progress is safe on this device.
- [ ] A save code is the only key to a save: it never appears in logs or telemetry.

## 6. Any screen

- [ ] Playable by mouse and by touch, on a laptop (1440x900), a tablet (1024x768) and a phone held sideways (844x390), with nothing important under the controls.

## Checked by

| Journey | Tests |
|---|---|
| 1, 2, 3, 4, 6 | `npm run test:game` ([tools/test.js](../tools/test.js), [tools/touch.js](../tools/touch.js)): onboarding with real clicks, a bot playing every level, saves, challenges, Field Guide, layouts |
| 5 | `npm test`: [server/test.js](../server/test.js), [server/telemetry.test.js](../server/telemetry.test.js), [test/integration.test.js](../test/integration.test.js) (a save continued on a second browser through its code) |
