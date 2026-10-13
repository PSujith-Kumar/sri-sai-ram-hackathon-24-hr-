# Connecting two phones to CareBridge

One phone is the **thermal phone** (always watching heat shapes, never faces). The other is the **camera phone**
(its camera stays off until the AI hears a change in the patient's voice or words, or the thermal phone sees
something unusual). Both link to the app over **USB tethering** (or Wi-Fi). Nothing goes to the internet.

```
 thermal phone ──┐                                   ┌─ Gemma 3 (Ollama, on this PC) reads the camera picture
                 ├─ USB tethering ─► CareBridge (PC) ┤
 camera phone ───┘                                   └─ mood model (Gemma 3 270M + e5, on this PC)
```

## What you need

| Phone | Needs | Notes |
|---|---|---|
| Thermal phone | A thermal camera the phone's **browser** can open (some USB thermal modules appear as a normal camera) | Most thermal attachments (FLIR One, Seek, built-in thermal phones) only work inside their own app, and a web page cannot read them. If yours is one of those, pick **Silhouette** mode: any phone camera, only a coarse moving shape is sent (no faces, **no temperatures, so no fever flag**). |
| Camera phone | Any phone with a camera and Chrome | Point it at the bed or chair. |

Both phones: a USB cable, Chrome (or another modern browser), and the screen kept on while connected.

## Steps

1. On the PC run `npm run dev`. The terminal prints `Phone link ready on port 8443 (HTTPS)` and the PC's addresses.
2. **Windows Firewall**: allow the port once (PowerShell, as administrator):
   `netsh advfirewall firewall add rule name="CareBridge phone link" dir=in action=allow protocol=TCP localport=8443`
3. Plug a phone into the PC and turn on **USB tethering** (Android: Settings → Network → Hotspot & tethering → USB tethering).
4. In CareBridge, sign in as the patient → **AI Companion** → **Phone cameras**. Pick the PC address on the phone's network
   (an Android tether is usually `192.168.42.x`), then scan the QR code for that phone.
5. The phone browser says the page is "not private". Tap **Advanced → Proceed**. It is your own PC (the card shows the
   certificate fingerprint to compare).
6. Tap **Start** on the phone page and allow the camera. The thermal phone picks Silhouette / Thermal picture / Test pattern.
7. In CareBridge tick **Use these two phones as my sensors**. In **AI & privacy settings** allow safety sensors, and turn on
   **Use Gemma 3**. Then **Start AI care mode**.

**Two phones over USB at once:** many Android phones tether on the same address range and can clash. Tether one phone by USB
and join the other to the PC's Wi-Fi (or a Wi-Fi hotspot). The Phone cameras card lists every PC address.

## Try it without phones

```
npm run dev                          # terminal 1
npm run phones:simulate              # terminal 2: pretends to be both phones, thermal shows a person who falls
node scripts/simulate-phones.mjs --scenario normal --image scripts/sample-calm.jpg   # a calm room instead
```

## How the switching works

| Signal | What happens |
|---|---|
| Thermal phone sees a possible fall, no movement, fever or heat hazard | The camera phone is switched on for a live look |
| The patient's **voice sounds different** from their usual voice, or their words/mood are worrying | The camera phone is switched on for a live look (this alone never confirms an incident) |
| Gemma 3 looks at the camera picture (about every 10 s) | Two looks in a row must agree before anything counts |
| Camera or thermal confirms something | Recording on this PC only, and the family, doctor and caretaker are alerted |
| All calm | The camera switches itself off again (about a minute) |

## Privacy rules (enforced by the phone gateway, not only by the app)

- The camera phone **sends nothing and keeps its camera closed** until the app asks. A picture sent without being asked is refused and never stored.
- If the app closes or crashes the cameras switch off within seconds. Switching off deletes the last picture.
- Only the newest picture is kept, in memory. Nothing is written to disk or logged. Pictures go to Gemma 3 on this PC only.
- The phone side is reachable only from private networks and needs the pairing token (**New pairing** invalidates old QR codes).
  The app's own side answers this computer only. The rest of the app is not exposed to the network.
- Each phone owner can **Pause sharing** or **Disconnect** at any time, which turns its camera off at once.
- There is no face recognition. The pairing is tied to the patient's account, so the AI knows whose room it is watching.

## What Gemma 3 does here

- **Conversation and camera** (`gemma3:4b` through Ollama): writes replies in the patient's language, adapted to their mood, and
  reads one camera picture at a time (posture, visible distress). It can only raise concern, never lower it.
- **Voice**: Gemma 3 reads text and pictures, not sound. The voice itself is analysed by the app (loudness, pitch, shakiness,
  pauses against the patient's own usual voice); that result and the transcript are what Gemma 3 gets.
- **Mood and severity** (`python ml/serve.py`): Gemma 3 270M fine-tuned on `ml/data`, averaged with the e5 model. Numbers are in
  `ml/GEMMA_REPORT_eval.md`. Temperature flags are screening hints, not a diagnosis.

## Troubleshooting

- *The phone cannot open the page*: firewall rule above; make sure you chose the PC address on the **same** network as that phone.
- *"Camera blocked" on the phone*: open the `https://` link (not `http://`) and accept the certificate warning.
- *Card says the phone link is not running*: start the app with `npm run dev` (a hosted copy cannot reach your phones).
- *Gemma does not answer*: `ollama pull gemma3:4b`, keep Ollama running, press **Test connection** in the Gemma card.
