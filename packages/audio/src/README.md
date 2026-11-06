# Multi-Channel Audio Subsystem

## Overview

Multi-channel audio subsystem based on Howler.js, managing sound playback, fading, looping, volume control, and audio state catch-up across persistent and one-shot channels.

## Interface

- `AudioManager`: Audio controller (`play(channelName, assetId, url, options)`, `stop(channelName, options)`, `pause(channelName)`, `resume(channelName)`, `setChannelVolume(channelName, volume)`, `getChannelVolume(channelName)`, `setMasterVolume(volume)`, `getMasterVolume()`, `mute()`, `unmute()`, `isMuted()`, `getChannelsState()`, `syncStateCatchUp(audioMap, assetResolver)`, `stopAll()`)
- Types: `AudioPlayOptions`, `AudioStopOptions`, `ChannelPreset`, `AudioChannelState`, `AssetAudioResolver`, `AudioCatchUpMap`

## Invariants

- Open Channel Registry: Dynamically instantiates channels upon request, pre-configured with presets for `music`, `sound`, `voice`, and `ambience`.
- Browser Autoplay Compliance: Automatically attaches single-fire pointer/keyboard listeners to unlock Web Audio context on user interaction.
- Unidirectional VM decouple: Operates purely on audio URLs and playback commands; does not depend on Renderer or DOM styling.

## Side Effects

- Web Audio Context & HTML5 Audio creation and playback via Howler.js.
- DOM Event listeners: Registers one-time `pointerdown` and `keydown` window event handlers for audio unlocking.
- Timer scheduling: Schedules timeouts for audio fade-out and resource unloading.

## Verification

- Run: `pnpm --filter @vn-engine/audio test`
