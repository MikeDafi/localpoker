import XCTest
final class LocalPokerUITests: XCTestCase {
 let app=XCUIApplication(bundleIdentifier:"host.exp.Exponent")
 let outDir="/Users/maskndaf/.superset/worktrees/51b79363-a05b-41fc-a889-975ad92ef0ea/oil-infinity/docs/qa/audit"
 // Querying `descendants(matching:.any)` walks every node in the RN tree, which
 // on the table screen is thousands of views and regularly blew XCUITest's
 // snapshot timeout. Text and buttons carry every label we match on, and that
 // subset is orders of magnitude smaller.
 // Match only static text. `descendants(matching:.any)` walks every node in the
 // RN tree (thousands of views on the table) and blew XCUITest's snapshot
 // timeout; `.count` is just as bad because it forces a full evaluation. Every
 // label this suite looks for is rendered as text.
 func any(_ t:String)->XCUIElement{
   app.staticTexts.matching(NSPredicate(format:"label CONTAINS[c] %@",t)).firstMatch
 }
 /// Tap targets are Pressables, which surface as buttons rather than text.
 func btn(_ t:String)->XCUIElement{
   app.buttons.matching(NSPredicate(format:"label CONTAINS[c] %@",t)).firstMatch
 }
 @discardableResult func tap(_ t:String,_ timeout:TimeInterval=10)->Bool{
   let b=btn(t)
   let e:XCUIElement = b.waitForExistence(timeout:timeout) ? b : any(t)
   guard e.waitForExistence(timeout:2) else {print("MISS \(t)");return false}
   for _ in 0..<6{if e.isHittable{e.tap();usleep(600_000);return true}; app.swipeUp(); usleep(400_000)}
   e.tap();usleep(600_000);return true
 }
 func save(_ n:String){let png=XCUIScreen.main.screenshot().pngRepresentation; try? png.write(to:URL(fileURLWithPath:"\(outDir)/\(n).png")); print("SAVED \(n)")}
 func test50Table() throws {
   app.activate(); sleep(2)
   if any("Confirm your age").waitForExistence(timeout:6) {
     let f=app.textFields.firstMatch
     if f.waitForExistence(timeout:5){ f.tap(); usleep(500_000); for d in ["1","9","9","8"]{ f.typeText(d); usleep(300_000) } }
     app.coordinate(withNormalizedOffset: CGVector(dx:0.5,dy:0.42)).tap(); usleep(500_000); _=tap("Enter",4)
   }
   if any("Play as Guest").waitForExistence(timeout:6){ _=tap("Play as Guest",4) }
   _=any("Quick Play").waitForExistence(timeout:12)
   if tap("Quick Play",8){ _=any("Start Game").waitForExistence(timeout:8); _=tap("Start Game",6); _=any("POT").waitForExistence(timeout:20); sleep(4); save("pol-table") }
 }
 func test51Emote() throws {
   app.activate(); sleep(2)
   if !any("POT").waitForExistence(timeout:4) {
     if any("Confirm your age").waitForExistence(timeout:6) {
       let f=app.textFields.firstMatch
       if f.waitForExistence(timeout:5){ f.tap(); usleep(500_000); for d in ["1","9","9","8"]{ f.typeText(d); usleep(300_000) } }
       app.coordinate(withNormalizedOffset: CGVector(dx:0.5,dy:0.42)).tap(); usleep(500_000); _=tap("Enter",4)
     }
     if any("Play as Guest").waitForExistence(timeout:6){ _=tap("Play as Guest",4) }
     if any("Quick Play").waitForExistence(timeout:12), tap("Quick Play",8) {
       _=any("Start Game").waitForExistence(timeout:8); _=tap("Start Game",6)
     }
     _=any("POT").waitForExistence(timeout:20); sleep(3)
   }
   // Open the emote sheet (💬 FAB, bottom-right), screenshot it, then send a GIF.
   // The FAB is covered by the showdown result card, so make sure a live hand is
   // in progress first (start the next hand if we're sitting on "Hand over").
   if any("Hand over").waitForExistence(timeout:2) { _=tap("Next Hand",4); sleep(1) }
   _=any("POT").waitForExistence(timeout:10)
   app.coordinate(withNormalizedOffset: CGVector(dx:0.92,dy:0.57)).tap(); usleep(900_000); save("pol-emote-tray")
   app.coordinate(withNormalizedOffset: CGVector(dx:0.16,dy:0.44)).tap(); usleep(1_200_000); save("pol-emote-bubble")
 }
 func test52Showdown() throws {
   app.activate(); sleep(2)
   if !any("POT").waitForExistence(timeout:4) {
     if any("Confirm your age").waitForExistence(timeout:6) {
       let f=app.textFields.firstMatch
       if f.waitForExistence(timeout:5){ f.tap(); usleep(500_000); for d in ["1","9","9","8"]{ f.typeText(d); usleep(300_000) } }
       app.coordinate(withNormalizedOffset: CGVector(dx:0.5,dy:0.42)).tap(); usleep(500_000); _=tap("Enter",4)
     }
     if any("Play as Guest").waitForExistence(timeout:6){ _=tap("Play as Guest",4) }
     if any("Quick Play").waitForExistence(timeout:12), tap("Quick Play",8) {
       _=any("Start Game").waitForExistence(timeout:8); _=tap("Start Game",6)
     }
     _=any("POT").waitForExistence(timeout:20); sleep(2)
   }
   _=tap("Fold",4)
   app.coordinate(withNormalizedOffset: CGVector(dx:0.68,dy:0.585)).tap(); usleep(500_000)
   _=any("Hand over").waitForExistence(timeout:30); sleep(1); save("pol-showdown")
 }

 // ---- Quick Play design audit -------------------------------------------
 // NOTE: never call app.activate() here — bringing Expo Go forward makes it
 // restore its *last* project (another worktree's tunnel) instead of ours.
 func dismissOpenDialog() {
   let sb = XCUIApplication(bundleIdentifier: "com.apple.springboard")
   for _ in 0..<3 {
     let open = sb.buttons["Open"]
     if open.waitForExistence(timeout: 4) { open.tap(); sleep(4) } else { break }
   }
 }
 func recoverIfError() {
   if any("There was a problem").waitForExistence(timeout: 2) {
     _=tap("Try again", 3); sleep(6); dismissOpenDialog()
   }
 }
 func enterQuickPlay() {
   if any("Confirm your age").waitForExistence(timeout: 5) {
     let f = app.textFields.firstMatch
     if f.waitForExistence(timeout: 5) { f.tap(); usleep(500_000); for d in ["1","9","9","8"] { f.typeText(d); usleep(250_000) } }
     app.coordinate(withNormalizedOffset: CGVector(dx:0.5, dy:0.42)).tap(); usleep(500_000); _=tap("Enter",4)
   }
   if any("Play as Guest").waitForExistence(timeout: 5) { _=tap("Play as Guest",4) }
 }
 func test90QuickPlayAudit() throws {
   dismissOpenDialog()
   sleep(6)
   recoverIfError()
   enterQuickPlay()
   guard btn("Quick Play").waitForExistence(timeout: 20) else { save("qp-00-stuck"); return }
   save("qp-01-home")
   _=tap("Quick Play", 8)
   _=any("Start Game").waitForExistence(timeout: 10)
   save("qp-02-setup")
   _=tap("Start Game", 6)
   _=any("Pot").waitForExistence(timeout: 25)
   sleep(3); save("qp-03-table-preflop")
   sleep(7); save("qp-04-table-later")
   // Advance through live streets so the board + pot actually render in the
   // community lane — that's where the layout has to hold up.
   for i in 0..<4 {
     if !tap("Check", 2) { _=tap("Call", 2) }
     sleep(4)
     save("qp-1\(i)-street")
   }
   app.coordinate(withNormalizedOffset: CGVector(dx:0.92, dy:0.57)).tap(); usleep(900_000)
   save("qp-05-emote-sheet")
   app.coordinate(withNormalizedOffset: CGVector(dx:0.5, dy:0.08)).tap(); usleep(700_000)
   save("qp-06-after-close")
 }

 // ---- Showdown reveal audit ----------------------------------------------
 // Plays a hand to a real showdown and samples the reveal choreography: the
 // winner's cards turning over, growing, travelling to the board, and the best
 // five being ringed. Also captures a "your turn" frame so the felt geometry can
 // be compared against the "hand over" frame — the table must not move.
 func test91ShowdownAudit() throws {
   dismissOpenDialog()
   sleep(6)
   recoverIfError()
   enterQuickPlay()
   guard btn("Quick Play").waitForExistence(timeout: 20) else { save("sd-00-stuck"); return }
   _=tap("Quick Play", 8)
   _=any("Start Game").waitForExistence(timeout: 10)
   _=tap("Start Game", 6)
   _=any("Pot").waitForExistence(timeout: 25)
   sleep(4)
   // Reference frame: action bar showing, my turn.
   save("sd-01-myturn")

   // Check/call down to a showdown. Bots may end it early by folding; either way
   // "Hand over" is the terminal state. Poll in short slices so the reveal is
   // caught as it starts rather than seconds later, already settled.
   // Drive the middle action button (Check/Call) by coordinate rather than by
   // label. Every label lookup forces an accessibility snapshot of the whole RN
   // tree, and doing that in a loop while bots are running Monte Carlo rollouts
   // reliably blew XCUITest's snapshot timeout. A fixed coordinate costs nothing.
   let over = any("Hand over")
   let checkOrCall = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.855))
   var reached = false
   for _ in 0..<18 {
     if over.exists { reached = true; break }
     checkOrCall.tap()
     sleep(2)
   }
   if !reached { _=over.waitForExistence(timeout: 40) }

   // Sample the reveal as it plays. The beats are flip 260ms, grow 700ms,
   // travel 1350ms, ring 2100ms from the start of the showdown.
   save("sd-02-reveal-flip")
   usleep(600_000);   save("sd-03-reveal-grow")
   usleep(700_000);   save("sd-04-reveal-move")
   usleep(800_000);   save("sd-05-reveal-ring")
   sleep(2);          save("sd-06-reveal-settled")

   // Next hand, then the reactions sheet — the GIFs must be one scrolling row.
   _=tap("Next Hand", 6)
   _=any("Pot").waitForExistence(timeout: 20)
   sleep(3)
   // The reactions FAB sits just under the hero's cards; the table is a fixed
   // height now, so it lands lower than it used to.
   app.coordinate(withNormalizedOffset: CGVector(dx:0.92, dy:0.625)).tap()
   usleep(1_500_000)
   save("sd-07-gif-row")
 }

 // ---- Board deal animation ------------------------------------------------
 // Captures rapid frames right after the flop is dealt, so the cards can be seen
 // travelling in rather than appearing in place.
 func test92BoardThrow() throws {
   dismissOpenDialog()
   sleep(6)
   recoverIfError()
   enterQuickPlay()
   guard btn("Quick Play").waitForExistence(timeout: 20) else { save("bt-00-stuck"); return }
   _=tap("Quick Play", 8)
   _=any("Start Game").waitForExistence(timeout: 10)
   _=tap("Start Game", 6)
   _=any("Pot").waitForExistence(timeout: 25)
   sleep(4)
   save("bt-00-preflop")
   // Act, then wait for the street to actually turn over before sampling. The
   // throw is 340ms with a 140ms stagger, so frames ~70ms apart catch it.
   if !tap("Check", 2) { _=tap("Call", 2) }
   // NB: a CONTAINS match on "Flop" also matches "Pre-flop", so detect the
   // street change by waiting for the pre-flop label to go away instead.
   let preflop = app.descendants(matching: .any)
     .matching(NSPredicate(format: "label CONTAINS[c] %@", "Pre-flop")).firstMatch
   var seen = false
   for _ in 0..<400 {
     if !preflop.exists { seen = true; break }
     usleep(30_000)
   }
   print(seen ? "FLOP SEEN" : "FLOP MISSED")
   for i in 0..<7 {
     save("bt-0\(i+1)-frame")
     usleep(70_000)
   }
 }

 // ---- Unattended soak ------------------------------------------------------
 // Navigates into Quick Play, then samples the screen on a timer using ONLY
 // screen captures — no accessibility queries at all. XCUITest's element queries
 // walk the whole React Native tree and time out on this screen; a screenshot
 // doesn't, so this verifies the table keeps playing and rendering correctly
 // without the harness interfering.
 func test93Soak() throws {
   dismissOpenDialog()
   sleep(6)
   recoverIfError()
   enterQuickPlay()
   guard btn("Quick Play").waitForExistence(timeout: 20) else { save("soak-00-stuck"); return }
   _=tap("Quick Play", 8)
   _=any("Start Game").waitForExistence(timeout: 10)
   _=tap("Start Game", 6)
   // From here on: no queries. The human seat auto-folds when its timer runs
   // out, so hands keep advancing on their own.
   sleep(8)
   for i in 0..<10 {
     save("soak-\(String(format: "%02d", i))")
     sleep(9)
   }
 }

 // ---- Board card continuity ----------------------------------------------
 // Captures a dense burst of frames while streets are dealt. No accessibility
 // queries at all - screenshots only - so the harness cannot perturb timing.
 // The analysis script then checks that the number of community cards never
 // decreases, which is what a card blinking out mid-hand would look like.
 func test94BoardContinuity() throws {
   dismissOpenDialog()
   sleep(6)
   recoverIfError()
   enterQuickPlay()
   guard btn("Quick Play").waitForExistence(timeout: 20) else { save("bc-00-stuck"); return }
   _=tap("Quick Play", 8)
   _=any("Start Game").waitForExistence(timeout: 10)
   _=tap("Start Game", 6)
   sleep(8)
   let act = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.855))
   var n = 0
   for round in 0..<4 {
     act.tap()
     // ~90ms apart for 3.6s: dense enough to catch a 340ms throw restarting.
     for _ in 0..<40 {
       save(String(format: "bc-%03d", n)); n += 1
       usleep(90_000)
     }
     _ = round
   }
 }

 // ---- Settings tab placement ---------------------------------------------
 // Screenshots the Table and Opponents tabs of Quick Play setup so the
 // placement of "Number of Opponents" can be confirmed visually.
 func test95SetupTabs() throws {
   dismissOpenDialog()
   sleep(6)
   recoverIfError()
   enterQuickPlay()
   guard btn("Quick Play").waitForExistence(timeout: 20) else { save("st-00-stuck"); return }
   _=tap("Quick Play", 8)
   _=any("Start Game").waitForExistence(timeout: 10)
   sleep(1)
   save("st-01-default-tab")
   // Tab strip sits under the header; step across it by coordinate.
   let ys = 0.205
   for (i, dx) in [0.16, 0.38, 0.60, 0.82].enumerated() {
     app.coordinate(withNormalizedOffset: CGVector(dx: dx, dy: ys)).tap()
     usleep(900_000)
     save("st-1\(i)-tab")
   }
 }

 // ---- Peel interaction ----------------------------------------------------
 // Drags a hole card's corner slowly while capturing frames, so the peel can be
 // judged for fluidity rather than guessed at. Screenshots only, no queries.
 func test96Peel() throws {
   dismissOpenDialog()
   sleep(6)
   recoverIfError()
   enterQuickPlay()
   guard btn("Quick Play").waitForExistence(timeout: 20) else { save("pl-00-stuck"); return }
   _=tap("Quick Play", 8)
   _=any("Start Game").waitForExistence(timeout: 10)
   _=tap("Start Game", 6)
   // Catch the face-up window before the card lays itself down.
   usleep(1_200_000); save("pl-00-dealt")
   sleep(4);          save("pl-01-covered")
   // NOTE: XCUITest synthetic drags are not delivered to react-native-gesture-
   // handler as moving touches, so this exercises the gesture's start/finish
   // but cannot drive the peel to full open. The render across the full range
   // was verified separately by sweeping the shared value directly.
   let corner = app.coordinate(withNormalizedOffset: CGVector(dx: 0.31, dy: 0.655))
   let away   = app.coordinate(withNormalizedOffset: CGVector(dx: 0.60, dy: 0.50))
   corner.press(forDuration: 0.2, thenDragTo: away, withVelocity: .default,
                thenHoldForDuration: 1.2)
   save("pl-02-peel-attempt")
   sleep(1)
   save("pl-03-released")
 }

 // Capture the table exactly as it sits after the lane rework, so the pot can
 // be measured against the hero pod rather than eyeballed. Query-free after the
 // taps for the reasons noted on test93.
 func test97Layout() throws {
   app.activate(); sleep(3)
   if any("Confirm your age").waitForExistence(timeout: 5) {
     let f = app.textFields.firstMatch
     if f.waitForExistence(timeout: 5) { f.tap(); usleep(500_000); for d in ["1","9","9","8"] { f.typeText(d); usleep(300_000) } }
     app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.42)).tap(); usleep(500_000); _=tap("Enter", 4)
   }
   if any("Play as Guest").waitForExistence(timeout: 5) { _=tap("Play as Guest", 4) }
   // The saved game is the heads-up table the layout complaint was about.
   if btn("Resume game").waitForExistence(timeout: 12) { _=tap("Resume game", 8) }
   else if btn("Quick Play").waitForExistence(timeout: 10) {
     _=tap("Quick Play", 8); _=any("Start Game").waitForExistence(timeout: 10); _=tap("Start Game", 6)
   }
   sleep(6);  save("lay-01-table")
   sleep(5);  save("lay-02-table")
   sleep(6);  save("lay-03-table")
 }

 // Heads-up is where the seat-width bug was worst: the pod is positioned for
 // SEAT_W but was drawn 76pt wide, so it sat half the difference off-centre.
 // Drive the opponent count down to 1 and photograph the result.
 func test98HeadsUp() throws {
   app.activate(); sleep(3)
   if any("Confirm your age").waitForExistence(timeout: 5) {
     let f = app.textFields.firstMatch
     if f.waitForExistence(timeout: 5) { f.tap(); usleep(500_000); for d in ["1","9","9","8"] { f.typeText(d); usleep(300_000) } }
     app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.42)).tap(); usleep(500_000); _=tap("Enter", 4)
   }
   if any("Play as Guest").waitForExistence(timeout: 5) { _=tap("Play as Guest", 4) }
   // Leave any table we resumed into, so Quick Play is reachable.
   if !btn("Quick Play").waitForExistence(timeout: 6) {
     app.coordinate(withNormalizedOffset: CGVector(dx: 0.09, dy: 0.10)).tap(); sleep(2)
     if btn("Leave").waitForExistence(timeout: 3) { _=tap("Leave", 3) }
   }
   guard btn("Quick Play").waitForExistence(timeout: 12) else { save("hu-00-stuck"); return }
   _=tap("Quick Play", 8)
   _=tap("Opponents", 8)
   sleep(1); save("hu-01-opponents-tab")
   // Step the count down to the minimum of 1. The stepper's minus glyph is a
   // U+2212, which XCUITest does not surface as a matchable button label, so
   // this taps where the control is instead.
   let minus = app.coordinate(withNormalizedOffset: CGVector(dx: 0.454, dy: 0.948))
   for _ in 0..<8 { minus.tap(); usleep(350_000) }
   save("hu-02-set-to-one")
   _=tap("Start Game", 8)
   sleep(7);  save("hu-03-table")
   sleep(6);  save("hu-04-table")
 }
 // Verify the fold renders, without needing a real finger. Synthetic drags are
 // not delivered to react-native-gesture-handler, but the cover animates from
 // fully peeled to flat on its own after the deal, so a burst of frames across
 // that window catches the crease part-way over the card - which is exactly the
 // state a peel produces.
 func test99PeelFrames() throws {
   app.activate(); sleep(2)
   if any("Confirm your age").waitForExistence(timeout: 5) {
     let f = app.textFields.firstMatch
     if f.waitForExistence(timeout: 5) { f.tap(); usleep(500_000); for d in ["1","9","9","8"] { f.typeText(d); usleep(300_000) } }
     app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.42)).tap(); usleep(500_000); _=tap("Enter", 4)
   }
   if any("Play as Guest").waitForExistence(timeout: 5) { _=tap("Play as Guest", 4) }
   if !btn("Quick Play").waitForExistence(timeout: 6) {
     // A previous test may have left a sheet open over the table.
     if btn("Close").waitForExistence(timeout: 2) { _=tap("Close", 2); sleep(1) }
     app.coordinate(withNormalizedOffset: CGVector(dx: 0.09, dy: 0.10)).tap(); sleep(1)
     // Leaving a table asks for confirmation.
     let leave = app.alerts.buttons["Leave"]
     if leave.waitForExistence(timeout: 3) { leave.tap() }
     sleep(2)
   }
   guard btn("Quick Play").waitForExistence(timeout: 12) else { save("pf-00-stuck"); return }
   _=tap("Quick Play", 8)
   _=any("Start Game").waitForExistence(timeout: 10)
   _=tap("Start Game", 6)
   // No queries and no sleeps: just grab frames as fast as the harness allows.
   for i in 0..<26 { save(String(format: "pf-%02d", i)) }
 }

 // The stats sheet, its per-stat info toggles, and the opponent read.
 func testA1Stats() throws {
   app.activate(); sleep(2)
   if !btn("Fold").waitForExistence(timeout: 6) {
     if any("Play as Guest").waitForExistence(timeout: 4) { _=tap("Play as Guest", 4) }
     let leave = app.alerts.buttons["Leave"]
     if leave.waitForExistence(timeout: 2) { leave.tap(); sleep(1) }
     if btn("Resume game").waitForExistence(timeout: 8) { _=tap("Resume game", 6) }
     else if btn("Quick Play").waitForExistence(timeout: 8) {
       _=tap("Quick Play", 6); _=any("Start Game").waitForExistence(timeout: 8); _=tap("Start Game", 6)
     }
   }
   sleep(5)
   // The stats button is the chart icon in the top-right of the table.
   app.coordinate(withNormalizedOffset: CGVector(dx: 0.905, dy: 0.108)).tap()
   sleep(2); save("st-01-you")
   // The info dot beside VPIP.
   app.coordinate(withNormalizedOffset: CGVector(dx: 0.158, dy: 0.585)).tap()
   sleep(1); save("st-02-you-help")
   _=tap("Opponents", 5)
   sleep(1); save("st-03-opponents")
   // The info dot beside an opponent's VPIP.
   app.coordinate(withNormalizedOffset: CGVector(dx: 0.248, dy: 0.824)).tap()
   sleep(1); save("st-04-opponent-help")
 }

 // Play a hand to the end, then put the reveal into the "show" state and
 // photograph it: the cards should peel, drop flat, and turn round to face the
 // table. The muck toggle starts in whichever state the settings imply, so this
 // drives it explicitly rather than assuming.
 func testA2ShowCards() throws {
   app.activate(); sleep(2)
   if any("Play as Guest").waitForExistence(timeout: 4) { _=tap("Play as Guest", 4) }
   if btn("Close").waitForExistence(timeout: 2) { _=tap("Close", 2); sleep(1) }
   if !btn("Fold").waitForExistence(timeout: 5) {
     if btn("Resume game").waitForExistence(timeout: 8) { _=tap("Resume game", 6) }
     else if btn("Quick Play").waitForExistence(timeout: 8) {
       _=tap("Quick Play", 6); _=any("Start Game").waitForExistence(timeout: 8); _=tap("Start Game", 6)
     }
   }
   sleep(5)
   var reached = false
   for _ in 0..<40 {
     if btn("your cards").waitForExistence(timeout: 1) { reached = true; break }
     if btn("Check").exists { _=tap("Check", 2) }
     else if btn("Call").exists { _=tap("Call", 2) }
     usleep(900_000)
   }
   guard reached else { save("sc-01-never-ended"); return }
   save("sc-00-banner")
   // "Mucked - tap to show" is the state that actually performs the reveal; if
   // the hand is already on show, toggle off first.
   // The toggle is labelled for screen readers, not with its visible text.
   if btn("Hide your cards").exists { _=tap("Hide your cards", 3); usleep(400_000) }
   guard btn("Show your cards").waitForExistence(timeout: 4) else { save("sc-01-no-show"); return }
   _=tap("Show your cards", 4)
   for i in 0..<16 { save(String(format: "sc-%02d-reveal", i + 2)) }
 }

 // App Store screenshot capture. Writes raw, unmodified frames that a separate
 // compositor turns into captioned marketing images.
 func storeOut(_ n:String){
   let png=XCUIScreen.main.screenshot().pngRepresentation
   let dir="/Users/maskndaf/.superset/worktrees/51b79363-a05b-41fc-a889-975ad92ef0ea/oil-infinity/docs/store/screenshots/raw"
   try? png.write(to:URL(fileURLWithPath:"\(dir)/\(n).png")); print("STORE \(n)")
 }
 func gate(){
   app.activate(); sleep(2)
   if any("Confirm your age").waitForExistence(timeout:6) {
     let f=app.textFields.firstMatch
     if f.waitForExistence(timeout:5){ f.tap(); usleep(500_000); for d in ["1","9","9","8"]{ f.typeText(d); usleep(300_000) } }
     app.coordinate(withNormalizedOffset: CGVector(dx:0.5,dy:0.42)).tap(); usleep(500_000); _=tap("Enter",4)
   }
   if any("Play as Guest").waitForExistence(timeout:6){ _=tap("Play as Guest",4) }
 }
 func home(){
   for _ in 0..<4 {
     if any("Quick Play").waitForExistence(timeout:3) { return }
     _=tap("Back",2); usleep(500_000)
   }
 }
 func testS1Store() throws {
   gate()
   _=any("Quick Play").waitForExistence(timeout:12)
   storeOut("01-home")

   // Setup screen: difficulty tiles and table options.
   if tap("Quick Play",8){
     _=any("Start Game").waitForExistence(timeout:8); sleep(1)
     storeOut("02-difficulty")

     // Play into a live hand so the board and pot are populated.
     _=tap("Start Game",6)
     _=any("POT").waitForExistence(timeout:20); sleep(3)

     // Drive a few streets so a board is out and chips are committed.
     for _ in 0..<7 {
       if btn("Check").waitForExistence(timeout:2) { _=tap("Check",2) }
       else if btn("Call").waitForExistence(timeout:2) { _=tap("Call",2) }
       usleep(900_000)
     }
     sleep(2)
     storeOut("03-table")
     storeOut("04-holecards")

     // Push to a showdown or hand result.
     for _ in 0..<14 {
       if btn("Next Hand").waitForExistence(timeout:1) { break }
       if btn("Check").waitForExistence(timeout:1) { _=tap("Check",1) }
       else if btn("Call").waitForExistence(timeout:1) { _=tap("Call",1) }
       usleep(800_000)
     }
     sleep(2)
     storeOut("05-showdown")
   }

   // Stats, populated by the hands just played.
   home()
   if tap("My Stats",6){ sleep(3); storeOut("06-stats") }
   home()
   if tap("Friends",6){ sleep(3); storeOut("07-friends") }
   home()
   if tap("My Pal",6){ sleep(3); storeOut("08-pal") }
 }

 /// Back chevron is an icon with no label, so tap it by position.
 func backTap(){
   app.coordinate(withNormalizedOffset: CGVector(dx:0.06,dy:0.066)).tap(); usleep(900_000)
 }
 func toHome(){
   for _ in 0..<5 {
     if any("Quick Play").waitForExistence(timeout:2) { return }
     backTap()
   }
 }
 func testS2Rest() throws {
   gate()
   toHome()

   // Mid-hand: capture the instant the hero has action buttons, which is the
   // frame that actually sells the game.
   if tap("Quick Play",8){
     _=any("Start Game").waitForExistence(timeout:8)
     _=tap("Start Game",6)
     _=any("POT").waitForExistence(timeout:20)
     var got=false
     for _ in 0..<26 {
       if btn("Fold").waitForExistence(timeout:1) && btn("Fold").isHittable {
         sleep(1); storeOut("03-table"); got=true; break
       }
       usleep(700_000)
     }
     if !got { storeOut("03-table") }

     // Advance a couple of streets, then grab another action frame with a board.
     for _ in 0..<5 {
       if btn("Check").waitForExistence(timeout:1) { _=tap("Check",1) }
       else if btn("Call").waitForExistence(timeout:1) { _=tap("Call",1) }
       usleep(900_000)
     }
     for _ in 0..<18 {
       if btn("Fold").waitForExistence(timeout:1) && btn("Fold").isHittable {
         sleep(1); storeOut("04-action"); break
       }
       usleep(700_000)
     }
   }

   toHome()
   if tap("My Stats",6){ sleep(3); storeOut("06-stats") }
   toHome()
   if tap("Friends",6){ sleep(3); storeOut("07-friends") }
   toHome()
   if tap("My Pal",6){ sleep(3); storeOut("08-pal") }
   toHome()
   if tap("Store",6){ sleep(3); storeOut("09-store") }
 }

 func testS3Missing() throws {
   gate()
   // Force back to home from whatever screen the last run left behind.
   for _ in 0..<8 { if any("Quick Play").waitForExistence(timeout:2) { break }; backTap() }

   if tap("My Stats",6){ sleep(3); storeOut("06-stats"); }
   for _ in 0..<6 { if any("Quick Play").waitForExistence(timeout:2) { break }; backTap() }

   if tap("Quick Play",8){
     _=any("Start Game").waitForExistence(timeout:8)
     _=tap("Start Game",6)
     _=any("POT").waitForExistence(timeout:20)
     // Wait for a frame where the hero is on the clock with a board out.
     for _ in 0..<30 {
       if btn("Fold").waitForExistence(timeout:1) && btn("Fold").isHittable {
         sleep(1); storeOut("03-table"); break
       }
       usleep(700_000)
     }
     // Play on, then grab a second action frame once the board has cards.
     for _ in 0..<4 {
       if btn("Check").waitForExistence(timeout:1) { _=tap("Check",1) }
       else if btn("Call").waitForExistence(timeout:1) { _=tap("Call",1) }
       usleep(900_000)
     }
     for _ in 0..<20 {
       if btn("Fold").waitForExistence(timeout:1) && btn("Fold").isHittable {
         sleep(1); storeOut("04-action"); break
       }
       usleep(700_000)
     }
   }
 }

 func testS4Extra() throws {
   gate()
   for _ in 0..<8 { if any("Quick Play").waitForExistence(timeout:2) { break }; backTap() }

   // Friends screen, captured properly this time. The earlier run caught it
   // mid load, which produced an unusable frame.
   if tap("Friends",6){
     sleep(5)
     _=any("crew").waitForExistence(timeout:6)
     sleep(2)
     storeOut("10-friends")
   }
   for _ in 0..<6 { if any("Quick Play").waitForExistence(timeout:2) { break }; backTap() }

   // Create or join room, which is the actual social hook.
   if tap("Play with Friends",6){ sleep(4); storeOut("11-room") }
   for _ in 0..<6 { if any("Quick Play").waitForExistence(timeout:2) { break }; backTap() }

   // A showdown where the hero wins, for the "beat the bots" angle.
   if tap("Quick Play",8){
     _=any("Start Game").waitForExistence(timeout:8)
     _=tap("Start Game",6)
     _=any("POT").waitForExistence(timeout:20)
     for _ in 0..<40 {
       if any("wins").waitForExistence(timeout:1) { sleep(1); storeOut("12-win"); break }
       if btn("Check").waitForExistence(timeout:1) { _=tap("Check",1) }
       else if btn("Call").waitForExistence(timeout:1) { _=tap("Call",1) }
       else if btn("Next Hand").waitForExistence(timeout:1) { _=tap("Next Hand",1) }
       usleep(700_000)
     }
     // An all-in or big-pot moment for drama.
     for _ in 0..<40 {
       if btn("All In").waitForExistence(timeout:1) && btn("All In").isHittable {
         sleep(1); storeOut("13-allin"); break
       }
       if btn("Check").waitForExistence(timeout:1) { _=tap("Check",1) }
       else if btn("Call").waitForExistence(timeout:1) { _=tap("Call",1) }
       else if btn("Next Hand").waitForExistence(timeout:1) { _=tap("Next Hand",1) }
       usleep(700_000)
     }
   }
 }
}
