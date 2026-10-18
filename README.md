# Roamigo

A travel planner for two. Trips, tickets, a shared budget, a day-by-day plan with route maps, and a bucket list. Both of you can edit at the same time and see each other's changes straight away.

It is a plain static site (HTML, CSS and JavaScript, no build step), so it runs on GitHub Pages.

## Files

| File | What it is |
|---|---|
| `index.html` | The whole app: layout, styles and logic |
| `backend.js` | Saving and syncing (Firebase, or demo mode in the browser) |
| `firebase-config.js` | Where your Firebase keys go |
| `firestore.rules` | Database rules that let only your two Google accounts in |
| `fonts/` | Manrope and Nice Memory |
| `images/` | Photos for the sample trips |

## 1. Try it locally

Browsers block JavaScript modules opened straight from disk, so serve the folder:

```bash
cd two-tickets-site
python3 -m http.server 8000
```

Then open http://localhost:8000. With no Firebase config it runs in **demo mode**: sample trips, and everything you change is saved in that browser only.

## 2. Put it on GitHub Pages

1. Create a repository on GitHub and push this folder to it.
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
4. After a minute the site is live at `https://<your-username>.github.io/<repo-name>/`.

At this point it still runs in demo mode. Do step 3 so the two of you share one planner.

## 3. Connect Firebase so you both see the same trips

Firebase's free Spark plan is enough. No card needed.

1. Go to https://console.firebase.google.com and **Add project**. Analytics can be off.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable.** Save.
3. Still in Authentication, open **Settings → Authorized domains** and add `<your-username>.github.io`.
4. **Build → Firestore Database → Create database.** Pick a location close to you and start in **production mode**.
5. Open the **Rules** tab, paste in `firestore.rules`, replace the two example emails with your Google addresses, and **Publish**.
6. **Project settings (gear icon) → General → Your apps → Web (`</>`)**. Register an app (no hosting needed) and copy the `firebaseConfig` object.
7. Paste it into `firebase-config.js` in place of `null`, commit and push.

Open the site, press **Sign in with Google**, and you're in. Your fiancé does the same with their account. Any other Google account sees "This account isn't on the guest list".

The Firebase web config is not a secret. It is meant to be public. The rules file is what keeps other people out, so don't skip step 5.

Once connected, the planner starts empty. Add your first trip with **New trip**.

## Notes

- **Photos.** Uploaded photos are resized to 1600px and stored in the database (about 300 KB each), so no paid storage plan is needed.
- **Maps.** Each day's route links to Google Maps. Paste a Google Maps link into a stop and the route sketch is drawn to scale.
- **Countdown.** The plane on the home page moves down the runway as the trip gets closer and takes off on the first day.

## Credits and licenses

- **Manrope** by Mikhail Sharanda, SIL Open Font License (`fonts/Manrope-OFL.txt`).
- **Nice Memory** by Sarid Ezra. The included file is the free demo, licensed for **personal use only**. A public GitHub repository makes the file downloadable by anyone, so either keep the repository private (GitHub Pages on a private repository needs a paid GitHub plan) or buy the full license from the designer before publishing it publicly.
- **Icons:** [Pixelarticons](https://pixelarticons.com), MIT License. The airplane and train are drawn to match.
- **Sample photos** from Wikimedia Commons:
  - Tegallalang rice terraces: Freddy eduardo, CC BY-SA 4.0
  - The Quiraing, Isle of Skye: Colin, CC BY-SA 4.0
  - Kyoto: Nina R from Africa, CC BY 2.0
  - Amalfi Coast: Bruno Rijsman, CC BY-SA 2.0
  - Reine, Lofoten: Lukas Beck, CC BY 4.0
