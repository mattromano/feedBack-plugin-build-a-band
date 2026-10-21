# YARG.Core five-fret engine porting map
Repo: https://github.com/YARC-Official/YARG.Core  (default branch: **master**, LGPL-3.0 per README/LICENSE)
Raw base: https://raw.githubusercontent.com/YARC-Official/YARG.Core/master/
NOTE: facts below were extracted via WebFetch summarisation (not verbatim). Re-read raw files while porting; exact line numbers only where marked.

## 1. Files
| Role | Path |
|---|---|
| 5-fret engine | YARG.Core/Engine/Guitar/Engines/YargFiveFretGuitarEngine.cs (class YargFiveFretGuitarEngine : GuitarEngine) |
| Guitar base | YARG.Core/Engine/Guitar/GuitarEngine.cs (abstract GuitarEngine : BaseEngine<GuitarNote,GuitarEngineParameters,GuitarStats>) |
| Params | YARG.Core/Engine/Guitar/GuitarEngineParameters.cs |
| Stats | YARG.Core/Engine/Guitar/GuitarStats.cs (+ YARG.Core/Replays/ReplayStats/GuitarReplayStats.cs) |
| Generic base | YARG.Core/Engine/BaseEngine.Generic.cs (BaseEngine<TNote,TParams,TStats>) |
| Non-generic base | YARG.Core/Engine/BaseEngine.cs |
| Base params/stats | YARG.Core/Engine/BaseEngineParameters.cs, YARG.Core/Engine/BaseStats.cs |
| Timer | YARG.Core/Engine/EngineTimer.cs (struct) |
| Hit window | YARG.Core/Engine/HitWindowSettings.cs |
| Sustains / solo / coda | YARG.Core/Engine/SustainList.cs (ActiveSustain<T>, SustainList<T>), SoloSection.cs, CodaSection.cs |
| Input | YARG.Core/Input/GameInput.cs, YARG.Core/Input/InputActions.cs (GuitarAction enum) |
| Note | YARG.Core/Chart/Notes/GuitarNote.cs (+ Note.cs) |
| Presets | YARG.Core/Game/Presets/EnginePreset.cs, EnginePreset.Defaults.cs, EnginePreset.Instruments.cs, BasePreset.cs |
| Tests (useful oracles) | YARG.Core.UnitTests/Engine/GuitarEngineTester.cs, EngineTester.cs, GuitarStatsTests.cs, EngineTimerTests.cs, HitWindowSettingsTests.cs, FiveFretBotSustainTests.cs, SustainListTests.cs |
| Game-side wiring | https://github.com/YARC-Official/YARG  Assets/Script/Gameplay/Player/FiveFretGuitarPlayer.cs (thresholds, CreateEngine) |
Six-fret variant (not needed): Engines/YargSixFretGuitarEngine.cs.

## 2. Per-file summaries
### Input / time model (BaseEngine*.cs)
- Input = `GameInput{double Time; int Action; union{int Integer; float Axis; bool Button}}` (packed struct). Action cast from `GuitarAction`.
- Host calls `QueueInput(ref GameInput)` (clamps inputs older than last queued/current time) then `Update(double time)`. Update: ProcessInputs(time) dequeues inputs <= time (skipping stale), for each: UpdateTimeVariables(input.Time) -> MutateStateWithInput(input) -> RunEngineLoop; then RunQueuedUpdates(time) (scheduled "interesting" times from GenerateQueuedUpdates: leniency timer ends, note front/back-end miss times, sustain drop/burst/end, SP whammy/drain, lane expiry, countdowns) and a final RunEngineLoop(time). Bots skip input queue and use UpdateBot.
- `RunEngineLoop(t)`: `do { UpdateTimeVariables(t); UpdateStarPower(); UpdateHitLogic(t);} while (ReRunHitLogic)`.
- `QueueUpdateTime(time, reason)` rejects current/past/duplicate. `ProcessUpToTime(time, inputs)` = reset + replay helper (handy for tests). `Reset(keepCurrentButtons)`.
- UpdateTimeVariables: sets LastUpdateTime/CurrentTime/CurrentTick (GetCurrentTick via SyncTrack), starts/ends codas, countdowns.
- Constants (BaseEngine): POINTS_PER_NOTE=50, POINTS_PER_PRO_NOTE=60, POINTS_PER_BEAT=25, STAR_POWER_MAX_MEASURES=8, SUSTAIN_BURST_FRACTION=4.
- Multiplier: `min(combo/10 + 1, MaxMultiplier)`, x2 when star power active. IncrementCombo/ResetCombo raise OnComboIncrement/OnComboReset.
- Star power: TicksPerQuarter/Half/FullSpBar derived from chart measure resolution (full bar = 8 measures, quarter = 2 measures... full=MeasureResolution*8? summariser said "set from MeasureResolution, doubling each step" -> verify). GainStarPower(ticks) caps at full bar, fires OnStarPowerReady crossing half. ActivateStarPower requires IsStarPowerInputActive && CanStarPowerActivate (>= half bar); also handles "revive". Drain = tick delta; at 0 -> ReleaseStarPower (OnStarPowerStatus(false)). AwardStarPower(note) adds TicksPerQuarterSpBar (a phrase = 1/4 bar), raises OnStarPowerPhraseHit; StripStarPower(note) clears SP flags on note+phrase, raises OnStarPowerPhraseMissed. Whammy SP gain: CalculateStarPowerGain(delta) = delta*GAIN_FACTOR + remainder, MAX_BEATS=8*4, GAIN_FACTOR=MAX_BEATS/(MAX_BEATS-2); whammy timer (StarPowerWhammyBuffer 0.25s) keeps gaining after last whammy input.
- Sustains: ActiveSustains (SustainList<ActiveSustain>); StartSustain (OnSustainStart), UpdateSustains (burst when tick >= TickEnd - SustainBurstThreshold [= Resolution/4]; drop when held-leniency lapses: CurrentTime >= LeniencyDropTime + SustainDropLeniency*SongSpeed; points = CalculateSustainPoints: (tick-BaseTick)/TicksPerSustainPoint where TicksPerSustainPoint=Resolution/POINTS_PER_BEAT; ceil'd; SP halves share), EndSustain(OnSustainEnd(note,timeEnded,finished)), RebaseSustains(oldMultiplier) on multiplier change.
- Solos: SoloSection list; HandleSoloNote; EndSolo bonus: if hit% < 0.6 -> 0 else mult=clamp((pct-0.6)/0.4,0,1), points=100*notesHit*mult rounded down to multiple of 50. Events OnSoloStart/OnSoloEnd(SoloSection).
- Hit window: `GetAverageNoteDistance(note)` = half gap to prev + half gap to next (fallback MaxWindow/2). `CalculateHitWindow()` -> (frontEnd, backEnd) from HitWindowSettings with that distance. `IsNoteInWindow(note,out missed,time)`: false before note.Time+frontEnd; missed=true after note.Time+backEnd.
- Hit/Miss: HitNote/MissNote -> Advance NoteIndex when chord fully resolved, solo/coda tracking, score, combo, SP awarding/stripping; `SkipPreviousNotes(note)` misses earlier unresolved notes (lane autohit may save them).
- Lanes (trill/tremolo): LaneAutohitWindow, LaneProximityProtectionWindow, SubmitLaneNote, AutohitNoteFromLane, IsInLaneLeniencyWindow, ActiveLaneIncludesNote. Coda/Big Rock Ending: CodaSection(5 frets), OnCodaStart/End. Optional for first JS port.
- Events (BaseEngine): OnStarPowerStatus(bool), OnStarPowerReady, OnSoloStart/End, OnCodaStart/End, OnComboReset, OnComboIncrement(int), OnUnisonBonusAwarded, OnPlayerRevived. (Generic): OnNoteHit(int idx, note), OnNoteMissed(int idx, note), OnStarPowerPhraseHit/Missed, OnSustainStart, OnSustainEnd(note,timeEnded,finished), OnCountdownChange. (Guitar): OnOverstrum().
- Scoring: AddScore(int pts) * ScoreMultiplier -> CommittedScore etc; GuitarEngine.AddScore(note) = POINTS_PER_NOTE * (1 + ChildNotes.Count) (50 per fret in chord). CalculateChartScores sums base. UpdateStars with StarScoreThresholds = floor(baseScore*mult[i] + soloScore*soloMult[i]).

### GuitarEngine.cs
- Consts: SOLO_MASK=31744 (bits 10-14), OPEN_MASK=64.
- State: EffectiveButtonMask(byte; frets | solo frets folded down via `InputButtonMask >> SoloGreenFret`), InputButtonMask(ushort), LastButtonMask, StandardButtonHeld, WasNoteGhosted, HasFretted/HasStrummed/HasWhammied/HasTapped(init true)/IsFretPress, HopoLeniencyTimer, StrumLeniencyTimer (EngineTimers from params), FrontEndExpireTime.
- ToggleFret(fret,bool), IsFretHeld(action), IsFretInput(input) (green..orange, solo frets, White3Fret), IsStrumInput (StrumUp/Down).
- `Overstrum()`: no-op if first note / past last note / wait countdown / ActiveLaneIncludesNote / in lane leniency / coda. Else: end all ActiveSustains (score them, OnSustainEnd), StripStarPower, ResetCombo, Overstrums++, UpdateMultiplier, OnOverstrum.
- CanSustainHold(note): extended sustains require note mask subset of held frets (open chord special-case).
- HitNote: marks hit; coda handling; AwardStarPower if phrase end; IncrementCombo; AddScore; StartSustain if sustain; OnNoteHit. MissNote: strips SP, ResetCombo, OnNoteMissed (BRE notes auto-hit in coda).
- GetLaneMask(), GenerateQueuedUpdates (queues "Strum/Hopo Leniency End").

### YargFiveFretGuitarEngine.cs
- OPEN_BRE_INPUT=int.MaxValue, WildcardMask = 1<<(Wildcard-1).
- `MutateStateWithInput(input)`: StarPower action -> IsStarPowerInputActive=input.Button; Whammy -> StartWhammyTimer; strum down/up pressed -> HasStrummed=true (+new note input); fret input -> LastButtonMask=EffectiveButtonMask; HasFretted/IsFretPress=true; ToggleFret; open bit set when no standard fret held (`(EffectiveButtonMask & ~OPEN_MASK)==0`). If a lane is active, submits lane note (multi-fret lane: whole mask; single: MSB fret or open).
- `UpdateHitLogic(time)`: UpdateTimers; strum handling: if HopoLeniencyTimer active -> strum consumed by hopo (disable both timers, rerun); else if StrumLeniencyTimer already active -> Overstrum; else start StrumLeniency timer (smaller offset/StrumLeniencySmall if no note in window); UpdateBot; coda; if no notes left clear flags + UpdateSustains + return; compute hit window; if fret pressed: HasTapped=true, FrontEndExpireTime set, ghost check (CheckForGhostInput, only if AntiGhosting) -> WasNoteGhosted, GhostInputs++; CheckForNoteHit(); UpdateSustains(); clear HasStrummed/HasFretted/IsFretPress.
- `CheckForNoteHit()`: loop from NoteIndex: stop at resolved note; if out of window -> try lane autohit (first note) else MissNote and stop; if !CanNoteBeHit skip (hopo/tap at index 0 blocks skipping); HOPO/tap hits if HasTapped && fret condition && front-end not expired (or InfiniteFrontEnd) && !ghosted (SoloTaps lets taps hit in solos); strum hit if HasStrummed or StrumLeniency active (first-note / combo==0 conditions apply to hopos needing strum).
- `CanNoteBeHit(note)`: held = EffectiveButtonMask minus frets of extended sustains (DisjointMask or NoteMask); if 0 -> OPEN_MASK; accept if masked mask hits, else full mask. IsNoteHittable: wildcard always; disjoint compares DisjointMask; open chords; exact match; strum chords require exact mask; hopo/tap chords use anchoring: `IsAnchoringValid(anchor, chordMask) && held - anchor == noteMask`; single notes: frets below the note may be held (anchor), open bit stripped.
- `IsAnchoringValid(anchor,target)`: anchor==0 or MSB(anchor) < MSB(target).
- `CheckForGhostInput(note)`: true iff previous note exists, fret pressed, note in window, highest held fret > MSB(LastButtonMask) (hammer-on), none of note's frets held, not in trill leniency.
- HitNote override: hopo/tap -> HasTapped=false & start HopoLeniency timer; else HasTapped=true & reset FrontEndExpireTime; disable strum leniency; end overlapping active sustains; base.HitNote. MissNote: HasTapped=false; base.
- UpdateTimers: HopoLeniency expiry -> disable + rerun; StrumLeniency expiry -> Overstrum + disable + rerun.
- UpdateBot: bot sets masks from next note at note.Time, holds extended-sustain frets, toggles SP.
- Coda: HandleCodaFretChange, GetCodaSections (BigRockEnding phrases), 5 frets.

### GuitarEngineParameters.cs  (: BaseEngineParameters; all public readonly)
HopoLeniency, StrumLeniency, StrumLeniencySmall (doubles, seconds), InfiniteFrontEnd, AntiGhosting, SoloTaps, NoStarPowerOverlap (bools). Ctor(hitWindow, maxMultiplier, spWhammyBuffer, sustainDropLeniency, starMultiplierThresholds, soloBonusStarMultiplierThresholds, hopoLeniency, strumLeniency, strumLeniencySmall, infiniteFrontEnd, antiGhosting, soloTaps, noStarPowerOverlap, enableLanes). Binary (de)serialisation (skip in JS).
BaseEngineParameters: HitWindow(HitWindowSettings), MaxMultiplier, StarPowerWhammyBuffer, SustainDropLeniency, StarMultiplierThresholds float[], SoloBonusStarMultiplierThresholds float[], EnableLanes, SongSpeed.

### GuitarStats.cs (: BaseStats)
Ints: Overstrums, HoposStrummed, GhostInputs. Reset(), copy ctor, serialization, ConstructReplayStats. BaseStats holds combo/score/notes hit/missed/SP/sustain etc. (read BaseStats.cs).

### EngineTimer.cs (struct)
TimeThreshold, Name, StartTime, EndTime (=StartTime + TimeThreshold*speed), SpeedAdjustedThreshold, IsActive; Start(t), StartWithOffset(t, offset) (end = t + |threshold-offset|... summariser flagged Math.Abs), Disable(), Reset(), IsExpired(t) (t >= EndTime), SetSpeed(s). Static BaseEngine.StartTimer(ref timer, time, offset=0).

### HitWindowSettings.cs
MaxWindow, MinWindow (swapped if reversed), FrontToBackRatio, IsDynamic, DynamicWindowSlope [0,1], DynamicWindowScale [0.3,3], DynamicWindowGamma [0.1,10], LaneAutohitWindow, LaneProximityProtectionWindow, Scale (runtime = song speed, not serialised).
- GetFrontEnd(full) = -(|full/2| * FrontToBackRatio) * Scale; GetBackEnd(full) = (full/2) * (2 - FrontToBackRatio) * Scale.
- CalculateHitWindow(avgDist): !IsDynamic -> MaxWindow; else Dark_Yarg_Impl: ms=avgDist*1000; r = (ms/(maxMs*Scale_dyn))^Gamma * (maxMs - minMs*Slope) + minMs*Slope; /1000; clamp [Min,Max].

### GuitarNote.cs
Fret enum FiveFretGuitarFret: Green=1,Red=2,Yellow=3,Blue=4,Orange=5,Open=7,Wildcard=8. NoteMask bits 0-4 G..O, bit 6 Open (OPEN_MASK=64). DisjointMask single-fret. GuitarNoteFlags: None=0, ExtendedSustain=1<<0, Disjoint=1<<1. Note type enum Strum/Hopo/Tap; props IsStrum/IsHopo/IsTap/IsSustain/IsExtendedSustain/IsDisjoint; ChildNotes (chord members, parent holds full NoteMask); also generic Note<T>: Time, Tick, TickEnd/TimeEnd, IsStarPower, IsStarPowerStart/End, IsSoloStart/End, WasHit/WasMissed, IsBigRockEnding.

### GuitarAction (Input/InputActions.cs), byte, values must not change:
Fret1..Fret6=0..5, StrumUp=6, StrumDown=7, Whammy=8 (axis), StarPower=9 (button), Fret11..Fret15=10..14 (solo frets). Aliases Green/Red/Yellow/Blue/Orange Fret = 0..4, SoloGreen..SoloOrange = 10..14.

## 3. Defaults (EnginePreset.Instruments.cs FiveFretGuitarPreset; line numbers count `using System;` as 1)
- HitWindow (lines ~120-127): MaxWindow 0.14, MinWindow 0.14, IsDynamic false, FrontToBackRatio 1.0, LaneAutohitWindow 0.160. HitWindowPreset class defaults: Dynamic scale 1.0, slope 0.93, gamma 1.5, LaneProximityProtectionWindow 0.080.
- HopoLeniency 0.08 s; StrumLeniency 0.05 s; StrumLeniencySmall 0.025 s; SustainDropLeniency 0.025 (DEFAULT_SUSTAIN_DROP_LENIENCY, line 15); AntiGhosting true; InfiniteFrontEnd false; SoloTaps false; NoStarPowerOverlap false; EnableLanes true.
- Consts (lines 13-18): DEFAULT_WHAMMY_BUFFER 0.25; DEFAULT_MAX_MULTIPLIER 4 (guitar); BASS_MAX_MULTIPLIER 6.
- Create(...) at ~line 145 builds GuitarEngineParameters.
- Other EnginePreset.Defaults.cs presets (line numbers from that file): Default = no overrides (line 7). Casual (lines 11-22): AntiGhosting false, InfiniteFrontEnd true, StrumLeniency 0.06, StrumLeniencySmall 0.03, LaneAutohit 0.200, LaneProximity 0.100. Precision (59-74): StrumLeniency 0.04, Small 0.02, Max 0.12, Min 0.04, IsDynamic true, Scale 1, Slope 0.93, Gamma 1.5, LaneAutohit 0.160, LaneProximity 0.080. SoloTaps preset: SoloTaps true.
- Star multiplier thresholds (game repo FiveFretGuitarPlayer.cs, NOT in Core): guitar `0.06,0.12,0.2,0.47,0.78,1.15`; bass `0.05,0.1,0.19,0.47,0.78,1.15` (fractions of base score for stars 1..6; star index 6 = gold). Solo bonus thresholds are defined in the TrackPlayer base (not retrieved).
- Star power: phrase hit = +TicksPerQuarterSpBar (1/4 bar), activate at >= half bar, full bar = 8 measures (STAR_POWER_MAX_MEASURES); whammy buffer 0.25 s; drain per tick. Points: 50/note (+50 per extra chord fret), sustain 25 per beat (Resolution/25 ticks per point... i.e. 25 pts/beat), multiplier +1 per 10 combo up to 4 (6 bass), x2 in SP.

## 4. Licence header
No per-file header exists in the files inspected (GuitarEngine.cs, YargFiveFretGuitarEngine.cs, BaseEngine*.cs, GuitarEngineParameters.cs, GuitarStats.cs, GuitarNote.cs, GameInput.cs): they start with `using` directives (some with a BOM). Licence is repo-level: LGPL-3.0 (README: "GNU Lesser General Public License v3.0", see LICENSE file). Recommendation: put a NOTICE in the JS port: "Derived from YARG.Core (https://github.com/YARC-Official/YARG.Core), (c) YARC contributors, licensed under LGPL-3.0; this port is also LGPL-3.0" and ship the LICENSE.

## Caveats
- All content came from summariser output; BaseEngine Star-power tick sizes, Solo bonus thresholds, StartWithOffset semantics, exact UpdateBot and CheckForNoteHit conditions must be confirmed against raw source (use `curl` of raw URLs when porting). Branch is `master`, not `main`.
