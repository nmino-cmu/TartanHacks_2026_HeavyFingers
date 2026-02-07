# TartanHacks_2026_HeavyFingers
TartanHacks 2026 Heavy Fingers project
Requirements:
pip install dedalus-labs
pip install xrpl-py
pip install python-dotenv


Setup:
get a dedalus labs API key
Make a .env file in this directory

Put this line in it: DEDALUS_API_KEY=dsk-test-.....

Google Login (NextAuth):
- Create Google OAuth credentials (Web app) and add redirect URI: http://localhost:3000/api/auth/callback/google
- Add to your .env:
  - GOOGLE_CLIENT_ID=...
  - GOOGLE_CLIENT_SECRET=...
  - NEXTAUTH_URL=http://localhost:3000
  - NEXTAUTH_SECRET=<random string>

Frontend:
npm install --legacy-peer-deps
