# 🔊 Agora Audio Debugging Guide

## Issue: Microphone On But No Agent Audio

The RTC connection works, your mic is transmitting, but you can't hear the agent speaking back.

---

## What I Added

I've added extensive logging to track the audio flow:

### ✅ New Debug Logs to Watch

1. **Connection State** - Shows when RTC connects/disconnects
2. **User Published Events** - Shows when agent publishes audio
3. **Audio Track Status** - Shows if agent's audio track is available
4. **Subscription Status** - Shows if we successfully subscribed to agent audio
5. **Audio Play Status** - Shows when we start playing agent audio

---

## How to Debug

### Step 1: Clear Browser Cache
1. Press **F12** (DevTools)
2. Go to **Console** tab
3. Right-click in console → **Clear Console**

### Step 2: Restart Dev Server
```bash
# Stop current server (Ctrl+C)
npm run dev
```

### Step 3: Refresh Browser
Press **Ctrl+R** or **Cmd+R** to do a hard refresh

### Step 4: Start a Call and Monitor Logs

1. Click "Start Laptop Demo Call (Agora)"
2. Keep your eyes on **Console** tab
3. You should see logs like:

```
[Agora] Joining channel price-check-1234567890 with UID 1002
[Agora] ✅ Joined channel price-check-1234567890
[Agora] Connection state changed: CONNECTING → CONNECTED
[Agora] Connection state after join: CONNECTED
[Agora] Remote users: 0  <-- ⚠️ Agent hasn't appeared yet
[Agora] ✅ Created microphone track
[Agora] ✅ Published microphone track
[Agora] ✅ Status set to connected
```

**Wait 3-5 seconds, then you should see:**

```
[Agora] User 0 published audio
[Agora] Successfully subscribed to user 0 audio
[Agora] ✅ Playing audio from user 0
```

---

## Critical Log Messages to Look For

### ✅ Good Signs
- `✅ Joined channel` - RTC connection works
- `✅ Published microphone track` - Your mic is sending
- `User 0 published audio` - **Agent is speaking!**
- `✅ Playing audio from user 0` - **Audio should play now**

### 🟠 Warning Signs
- `⚠️ Audio published but no audioTrack available` - Agent speaking but no audio data
- `❌ Failed to subscribe` - Network issue
- `Remote users: 0` (stays 0 forever) - Agent didn't join the channel

### 🔴 Error Signs
- `CAN_NOT_GET_GATEWAY_SERVER` - Token issue
- `User disconnected` - Connection dropped
- `UID conflict` - Two devices using same UID

---

## Checklist: What Could Be Wrong

### 1️⃣ Agent Not Publishing Audio
**Symptom:** You never see `User 0 published audio`

**Cause:** TTS configuration or agent crashed

**Fix:** Check:
- Is `AGORA_TTS_KEY` valid?
- Is `AGORA_TTS_REGION` correct? (eastus, westus, etc.)
- Is `AGORA_TTS_VOICE` available in Microsoft TTS?
- Check Agora Console for agent errors

**Test it:**
```bash
npm run test:agora:voice -- --phone="+84832787977" --leave --waitMs=5000
```

### 2️⃣ Audio Published But Not Playing
**Symptom:** `User 0 published audio` but then:
- `⚠️ Audio published but no audioTrack available`
- Or no "Playing audio" message

**Cause:** Agent published but no audio data, or media type mismatch

**Fix:**
- Wait longer (agent might still be initializing)
- Check browser speaker isn't muted
- Try a different browser (Chrome/Edge recommended)

### 3️⃣ Browser Volume Off
**Symptom:** Logs show `✅ Playing audio` but you hear nothing

**Cause:** Browser or system volume muted

**Fix:**
- Check browser volume (look for 🔇 icon in address bar area)
- Check Windows volume isn't muted
- Check headphones are plugged in (if using)
- Unmute browser tab (right-click tab → Unmute tab)

### 4️⃣ Speaker Not Connected
**Symptom:** Everything looks good in logs but no audio output

**Cause:** No speakers/headphones connected

**Fix:**
- Plug in headphones or speakers
- Check device settings in browser (Settings → Site Settings → Microphone/Camera)

---

## Browser DevTools Filter Trick

Instead of scrolling, filter logs:

1. In Console, type in the filter box: `Agora`
2. Now you only see Agora debug messages
3. Much easier to read!

---

## Expected Timeline

When you start a call, here's what should happen:

```
T+0s   ✅ Joined channel
       ✅ Published microphone
       (Status: connecting)

T+1-2s ✅ Status set to connected
       (Status: connected, you can now speak)

T+2-4s User 0 published audio
       Successfully subscribed
       ✅ Playing audio
       (You should hear the agent greeting)

T+5s   (Agent waits for your input)

T+10s  You speak: "What's your price for 100 units?"
       (Your speech shown as "you" in transcript)

T+12s  Agent responds: "For 100 units, the price is..."
       (Agent's speech shows in transcript + audio plays)
```

---

## If You See Connection Errors

### "Token Failed" or "401 Unauthorized"
- `AGORA_APP_CERTIFICATE` might be wrong
- Or `AGORA_APP_ID` doesn't match

**Fix:** Verify in Agora Console

### "Channel Closed" or "404"
- Channel might have expired (they auto-close after idle timeout)
- Try starting a new call

### "Cannot Get Gateway Server"
- Network firewall blocking Agora
- Try a different network (not a restrictive corporate WiFi)

---

## Step-by-Step Testing (If Audio Still Not Working)

### Test 1: CLI Test (Bypasses UI)
```bash
npm run test:agora:voice -- --phone="+84832787977" --leave --waitMs=3000
```

Check if this returns valid agent_id. If it does, the Agora backend works.

### Test 2: Microphone Test
1. In DevTools Console, type:
```javascript
const AgoraRTC = await import('agora-rtc-sdk-ng');
const mic = await AgoraRTC.createMicrophoneAudioTrack();
mic.play();
// You should hear yourself (echoing)
mic.close();
```

This tests if your mic + speaker hardware works.

### Test 3: Simple Agora Test
If you have another Agora project working, test if it has audio.
This helps isolate if it's this project or Agora generally.

---

## Console Output Template

When you share the console output, include these sections:

```
[Agora] Joining channel...
[Agora] ✅ Joined channel
[Agora] Connection state changed: CONNECTING → CONNECTED
[Agora] Remote users: X  <-- How many agents joined?
[Agora] User Y published audio  <-- Did this appear?
[Agora] Successfully subscribed to user Y audio
[Agora] ✅ Playing audio from user Y  <-- Did this appear?
```

---

## Questions to Check

❓ Does your **mic work** in other apps? (Zoom, Teams, etc.)

❓ Are **speakers/headphones connected** and NOT muted?

❓ Are you using **Chrome, Edge, or Firefox**? (Safari has limitations)

❓ Did you **wait 3-5 seconds** after "Voice session connected" before trying to speak?

---

## Next: Share Your Logs

1. Restart dev server
2. Open console
3. Filter by "Agora"
4. Start a call
5. Wait for "Voice session connected"
6. Wait 5 more seconds
7. Copy all console output

**Share the output and I can pinpoint exactly what's happening!**
