# WeatherWise — Route-aware weather decisions

WeatherWise turns forecast data into explainable recommendations for activities and driving-route departure windows.

## New in Phase 4

- **Driving-route weather:** Enter two cities; an OSRM route supplies route geometry and estimated driving duration.
- **Three weather checkpoints:** OpenWeatherMap forecasts at the origin, approximate route midpoint and destination.
- **Departure comparison:** Compare three departure times, with personalized activity scores and checkpoint breakdowns.
- **Honest limitations:** This is not turn-by-turn navigation, real-time traffic, hyperlocal weather, or a safety advisory. Forecasts are only available in roughly 3-hour intervals, and checkpoints use nearest available slots within 2 hours.

Existing features: activity planner, current conditions, best forecast windows, saved cities, personalized temperature/rain/wind tolerance, server-side weather API key, rate limiting, caching, and input validation.

## Run locally

Requires Node.js 20+ and a valid OpenWeatherMap API key with access to current weather, 5-day/3-hour forecast and geocoding.

```bash
cd ~/WeatherApp
export OPENWEATHER_API_KEY="YOUR_NEW_KEY"
npm start
```

Open http://localhost:3000. Tests: `npm test`. No npm install is required (built-in Node modules only).

## API services and privacy

- OpenWeatherMap: current weather, forecast, and city geocoding. API key stays on the Node server.
- Public OSRM demo routing: driving routes only. Route endpoint may be unavailable or rate-limited; use your own OSRM deployment for production. City coordinates are transmitted to the OSRM routing service.
- User settings and saved cities stay in browser localStorage. The server caches weather and route responses for 10 minutes in memory. No accounts or persistent server database.

## Deployment

Deploy to a Node.js host; GitHub Pages alone cannot run this backend. Set `OPENWEATHER_API_KEY` in the host's environment. Do not commit `.env` files or API keys. Revoke previously exposed keys.

## Known limitations

Route duration is an OSRM estimate without traffic; driving routes are not suitable for cycling or walking directions. Route scoring evaluates weather conditions for the selected *activity* but does not change the underlying driving route. The route midpoint is approximate along route geometry. Three sampled locations cannot represent all conditions along a long route. Score is a transparent heuristic, not a validated safety metric.
