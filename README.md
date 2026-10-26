# Fantasy Front Office

A multi-sport fantasy game: draft a roster, play a five-week season and playoffs, react to an AI news desk, and watch every game week unfold in a live broadcast. Play solo against AI general managers or in a private league with friends.

## What's in the folder

| File | Purpose |
|---|---|
| `index.html` | The game screens: league and invites, draft, trade desk, news desk, predictions, game day, standings, analytics |
| `engine.js` | The season rules, shared by the page (solo play) and the server (leagues): schedules, live play-by-play, standings, playoffs and news |
| `server.js` | Node server: serves the page, hosts leagues, and talks to the Claude API for trades, agents and the news desk |
| `Dockerfile` | Builds the container |
| `docker-compose.yml` | One-command start, with your API key from `.env` and a volume that keeps league data |
| `.env.example` | Template for your API key |

## Run it with Docker

1. Start it from inside the `fantasy-front-office` folder:

   ```
   docker compose up --build
   ```

2. Open http://localhost:8080
3. Optional, for AI-powered rival GMs and agents: get an API key from https://console.anthropic.com, copy `.env.example` to `.env`, paste your key in it, and run `docker compose up --build` again. Without a key, the game runs with offline negotiators.

### Troubleshooting

- **"env file .env not found":** you have an older `docker-compose.yml`. Use the one in this folder; `.env` is now optional.
- **The page shows a red "engine.js is missing" bar:** keep `engine.js` in the same folder as `index.html` and rebuild.
- **The page says index.html can't be read, or shows a 500 error:** rebuild with the latest `Dockerfile` using `docker compose up --build`. Leaving out `--build` reuses the old image.
- **"Port 8080 is already in use":** stop the other program, or change the first number in `ports:` in `docker-compose.yml` (for example `"8081:8080"`) and open http://localhost:8081
- **See what the server is doing:** `docker compose logs -f`

Without Docker Compose:

```
docker build -t fantasy-front-office .
docker run -p 8080:8080 -v ffo-data:/app/data -e ANTHROPIC_API_KEY=your-key-here fantasy-front-office
```

## How a season works

1. **Draft.** Four rounds, snake order, against four rival GMs (AI or your friends).
2. **Regular season: five weeks.** Each week you play one head-to-head matchup, and every manager plays each rival once. Each manager gets one bye week.
3. **Every week:**
   - Read the **News desk**. Injuries, hot streaks, slumps, breakouts and trade rumors change player projections for that week.
   - Make your **Predictions** for the four pro games. Prediction points add up all season.
   - Make trades on the **Trade desk**.
   - Select **Kick off** on **Game day**.
4. **Playoffs.** After week 5 the top four seeds play the semifinals (1 vs 4, 2 vs 3), then the championship and a third-place game. The trade deadline is the end of the regular season.
5. **Champion.** The winner gets a trophy celebration, and the standings page shows the bracket and season awards. Select **Start a new season** to draft again.

### Game day

Choose a **Full broadcast** (75 seconds), a **Quick broadcast** (30 seconds) or **Instant results**. During a broadcast:
- Your matchup scoreboard and win probability update play by play.
- The four pro games tick through quarters or innings, and a play-by-play feed highlights your players.
- Your commissioner calls your players' big plays, lead changes and halftime, and announces the final.
- **Skip to final** jumps straight to the result.

In a league, everyone watches the same broadcast at the same time, and only the commissioner can kick off a week.

### News desk

- Each week brings new stories: a player ruled out scores zero, a questionable player drops 40%, a hot streak adds 25%, a slump costs 20%, and a breakout adds 40%.
- Trade rumors mean a specific AI GM will pay about 15% more for one of your players.
- Rival GMs read the news differently. Dr. Ada Whitfield trusts every report, Lucky Lou only believes good news, and Duke Harlan stays loyal to his hometown players. Use that when you trade.
- Your agent (in a league) or your front office memo (solo) explains what each story means for your roster, and links straight to the trade desk.
- After every week, a recap story covers the results. With an API key, Claude rewrites the stories in sports-wire style. The effects never change, only the writing.
- Select **Read the headlines** to hear them in your commissioner's voice.

## Leagues and invites

1. Open the **League & invites** tab and choose **Create a league**: name it, enter your manager name, and pick a sport. You become the commissioner.
2. Share the **invite link**, the **6-character invite code**, or the **Email invite** button.
3. Friends open the link (or enter the code on the League tab), type their name and join. Each friend takes over one of the four AI seats.
4. When everyone is in, the commissioner selects **Start the draft**. Any empty seats are played by AI GMs, and the league closes to new members.
5. Everyone drafts live in snake order. Screens update every few seconds, and you get an alert when you're on the clock. If someone walks away, the commissioner can **auto-pick** for them.
6. After the draft, each person makes trades (with AI GMs, or with other managers through agents) and saves their own predictions each week. Predictions stay hidden from the others until kickoff.
7. The commissioner kicks off each week on **Game day**, and everyone watches the live broadcast together.

Each device remembers which league it belongs to. **Play solo** switches back to single-player mode without leaving the league. The commissioner can **Start a new season** to draft again with the same members.

### Making the invite link work for friends

`localhost` only works on your own computer. To let friends join:

- **Same Wi-Fi or school network:** find your computer's local IP address (`ipconfig` on Windows, `ipconfig getifaddr en0` on Mac). Open the game at `http://<that-ip>:8080`, for example `http://192.168.1.20:8080`, then create the league from that address so the invite link uses it. Your firewall may ask you to allow port 8080.
- **Anywhere on the internet:** deploy the container to a hosting service that runs Docker (for example Render, Fly.io, Railway or a cloud VM) and share that web address.

League data is saved in the `league-data` Docker volume, so leagues survive restarts. Leagues with no activity for 30 days are cleaned up automatically.

## Commissioner character and voice

Select the 🎙️ button in the top bar, or **Change** in the Commissioner's booth, to choose your commissioner:

| Commissioner | Style |
|---|---|
| Chuck "The Voice" Holloway | Old-school play-by-play legend |
| DJ Blaze | Over-the-top hype host |
| Dr. Margaret Pierce | Calm, numbers-first analyst |
| Coach Hank Dawson | Gruff old-school coach |
| COMMISH-9000 | Robotic league overseer |

Each one has their own catchphrases and a default voice speed and pitch. You can still pick any voice installed on your device and fine-tune speed and pitch. Turn on the 🔇 voice button to hear announcements. Your choice is saved on this device.

## Agents: trades between league managers

In a league, each human manager has an AI sports agent. Open **Trade desk → League managers**:

- **Choose your agent:** Max Sterling (smooth closer), Grandma Gertie (sweet but shrewd, avoids risky players), Rocco "The Hammer" Brass (loud and pushy), Nova-7 (robot projection math) or Sunny Day (loves a win-win). Each agent has their own personality, valuation style and voice.
- **Ask your agent for an idea:** the agent scans the other managers' rosters and suggests a deal that helps you and that the other side's agent might accept.
- **Send your agent:** pick the manager, who you send and who you want, and add an optional note with talking points. Your agent delivers the pitch in character.
- **Get private advice:** when an offer arrives, your agent tells you, and only you, whether to accept, counter or decline, and suggests a counter.
- **Negotiate:** accept, decline, or counter, for up to three rounds.
- **Autopilot:** turn it on and your agent answers incoming offers for you, accepting good deals, countering close ones and declining bad ones.
- Completed trades appear on the **League trade wire** for everyone. Open negotiations close when the next week kicks off, and trading ends at the deadline after Week 5.
- Select any agent message to hear it in that agent's voice.

## Trade desk with AI general managers

- Pick your GM persona: The Closer, The Rookie, The Bulldozer or The Charmer.
- Choose a rival AI GM. Each has a personality and their own way of valuing players:
  - **Vic "The Shark" Moreno**: ruthless, overvalues his own players
  - **Duke Harlan**: hometown hero, loves two local franchises
  - **"Lucky" Lou Castillo**: gambler, chases high ceilings and risk
  - **Dr. Ada Whitfield**: the professor, pure projection math
- Choose who you send and who you want, type a pitch, and send the offer. The rival accepts, rejects or counters in character.
- Each rival has a patience meter. Lowball them too often and they stop taking your calls for the week.
- In a league, this tab lists the AI seats. Trades with human managers go through agents on the **League managers** tab.

## Safety and cost

- The API key lives only on the server. The browser never sees it.
- The server builds the AI prompts itself, so the page can't be used to send arbitrary requests to the API.
- In leagues, the server runs the draft, trades and every game week, so players can't edit each other's teams from their browser.
- A built-in valuation engine sets the trade limits. The AI can be talked into a close deal but never a lopsided one.
- Requests are rate limited per visitor.
- Each trade offer is one short API call to a small, fast model. You can change the model with `ANTHROPIC_MODEL` in `.env`.

## No key or no server? It still works

- Without an API key, rival GMs and player agents use built-in lines and negotiating rules. The badge on the trade desk shows which mode is active.
- Agents only write dialogue and advice. Every trade between managers needs the other manager's approval, or their agent on autopilot, and the server checks both rosters before any players move.
- If you open `index.html` directly as a file, solo play works fully, but leagues need the server.
