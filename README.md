# monopoly.ojee.net

online browser monopoly. richup.io-style — lobby rules, custom boards, auctions, trades with negotiation, mortgage, chat, sound. no accounts, just pick a name and a color.

live at [monopoly.ojee.net](https://monopoly.ojee.net). api on `monopoly-api.ojee.net`.

## stack

react 19 client, node/express + socket.io server, mongodb. in-memory game state with periodic snapshot to mongo (pattern cloned from mtg.ojee.net).

## running it locally

need node 18+ and a local mongodb.

server:

```bash
cd server
npm install
# .env needs:
#   MONGODB_URI=mongodb://localhost:27017/monopoly
#   CLIENT_URL=http://localhost:3000
#   PORT=5004
node index.js
```

client:

```bash
cd client
npm install
npm start
```

## deploy

see `deploy/` for nginx configs and the systemd unit for disinteg.
