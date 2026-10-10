# Music Streaming App — React Conversion

Your HTML/CSS/routing was converted into a React + Vite project with React Router.

## Structure
```
src/
  main.jsx              # entry point
  App.jsx               # routes
  pages/
    Home.jsx            # main player UI (was index.html)
    Login.jsx           # login.html
    Register.jsx        # register.html
    ForgotPassword.jsx  # forgot-pass.html
    ResetPassword.jsx   # reset-password.html
  styles/
    main.css            # your style.css
    auth.css            # your auth.css
```

## Run it
```bash
npm install
npm run dev
```
Then open the local URL Vite prints (usually http://localhost:5173).

## What changed from your original code
- Links (`<a href="login.html">`) became `<Link to="/login">` from `react-router-dom`, so navigation doesn't reload the page.
- Buttons (play/pause, shuffle, repeat, favorite heart, mood picker, volume/progress sliders) are now wired to React state instead of being static markup — that's your requested "JS" behavior.
- Each form (login, register, forgot password, reset password) has basic client-side validation and a clearly marked `TODO` where you plug in your real backend API call (e.g. `fetch('/api/auth/login', ...)`).
- Put your images in `public/images/` (e.g. `public/images/1.png`, `public/images/default-song.jpg`) — they're referenced with root-relative paths like `/images/1.png`.

## Next: connecting a backend
Since you mentioned wanting to build a backend + API next — once you tell me your stack (Node/Express, Python/Django/FastAPI, etc.), I can:
1. Scaffold auth endpoints (`/api/auth/login`, `/register`, `/forgot-password`, `/reset-password`) that match these forms exactly.
2. Add a songs/playlists API that the Home page's `SAMPLE_SONGS` data can be swapped for (`fetch('/api/songs')`).
3. Add JWT-based session handling so `Login.jsx` actually authenticates.
