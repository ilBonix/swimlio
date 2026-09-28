# SWIMLIO

**Smart Swim Training**

SWIMLIO is a mobile-first swimming workout planner designed to make structured swim training simple, understandable and practical.

It creates personalised sessions for **individual swimmers and training groups**, adapting the workout to the swimmer's level, available time, pool length and training goal.

> Planifica · Nada · Evoluciona

## What SWIMLIO does

SWIMLIO helps you build complete swimming sessions without having to design every set manually.

Current features include:

- Individual and group profiles
- Beginner, intermediate and advanced levels
- 25 m and 50 m pools
- Technique, endurance, speed and mixed sessions
- 30–90 minute workouts
- Automatic distance and rest calculation
- RPE-based intensity guidance
- Exercise explanations for swimmers without technical knowledge
- Session Mode for following the workout poolside
- Workout history and post-session feedback
- Adaptive workload based on previous sessions
- Optional equipment selection for each workout
- Offline-capable Progressive Web App (PWA)
- Mobile-first interface designed for iPhone and Android

## Profile-first training

A SWIMLIO profile stores the information that normally does not change from one session to another:

- Name
- Level
- Pool length
- Individual or group mode
- Number of swimmers and lanes for group profiles
- Optional reference pace

When creating a workout, you only choose what matters **today**: training type, duration, focus and equipment available for that session.

Temporary changes can also be made without modifying the saved profile.

## Training philosophy

SWIMLIO is built around a rules-based training engine rather than random workout generation.

The engine considers:

- swimmer level
- training objective
- target duration
- estimated swimming pace
- repetition distance
- recovery periods
- transitions between blocks
- group organisation
- previous workout feedback
- recent session similarity

The aim is to produce sessions that are varied while remaining coherent, practical and easy to follow.

## Install on iPhone

SWIMLIO currently works as an installable PWA.

1. Open **https://ilbonix.github.io/swimlio/** in Safari.
2. Tap **Share**.
3. Select **Add to Home Screen**.
4. Open SWIMLIO from its new icon.

The app can then run in standalone mode and keeps profile/history data locally on the device.

## Install on Android

SWIMLIO can also be installed as a PWA on Android.

1. Open **https://ilbonix.github.io/swimlio/** in Chrome.
2. Open the browser menu (⋮).
3. Tap **Install app** or **Add to Home screen**.
4. Confirm the installation.
5. Open SWIMLIO from its new app icon.

Depending on the Android version and browser, the wording may vary slightly. Once installed, SWIMLIO opens in standalone mode and stores profile/history data locally on the device.

## Privacy

SWIMLIO currently has no account system and no backend.

Profile and workout history data are stored locally in the browser/PWA storage on your device. Removing the app, clearing site data or resetting the browser may remove this information.

Cloud sync and optional accounts are planned for a future version.

## Current status

SWIMLIO is under active development.

The current release is an early mobile release candidate intended for real-world testing before native Android and iOS packaging.

### Planned improvements

- Larger structured exercise library
- Better pace-based time estimation
- Improved adaptive progression
- Persistent in-session progress
- Native Android and iOS builds
- Cloud backup and profile sync
- Weekly training planning
- Coach/group management tools
- Accessibility and UI refinements

## Support SWIMLIO

SWIMLIO is currently an independent project.

If you find it useful and would like to help fund continued development, testing, hosting and future native releases, a supporter page will be added here soon.

Possible supporter benefits in the future may include early access to experimental features, development updates and participation in feature feedback. Core training functionality should remain useful without requiring support.

## Feedback

SWIMLIO is being shaped through real use in the pool.

Bug reports, usability feedback and feature suggestions are welcome through GitHub Issues.

## Development

The project is currently a lightweight web application built with HTML, CSS and JavaScript, with PWA support through a web manifest and service worker.

The goal is to keep the training engine independent enough to later package the same product using a native wrapper such as Capacitor.

---

**SWIMLIO**  
Smart Swim Training  
*Planifica · Nada · Evoluciona*
