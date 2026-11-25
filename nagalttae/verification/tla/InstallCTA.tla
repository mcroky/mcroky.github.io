---------------------------- MODULE InstallCTA -----------------------------
EXTENDS Naturals, FiniteSets
CONSTANT MaxOffers

\* Source read at 2ea98340ad3a6bc2d9de2e148d0d129010352d3b plus local
\* app.js mountInstall (235-296), index.html install-app and push-install.
\* JS runs synchronously up to await prompt.prompt(); the browser controls
\* offer arrival, completion, appinstalled and display-mode transitions.
\* Each real beforeinstallprompt event has a fresh identity. The two modes
\* combine matchMedia().matches and iOS navigator.standalone into one flag.
\* Visibility refers to each CTA's hidden attribute (the inline CTA uses its
\* wrapper). Only eligible web pages mount; native/file/insecure pages do not.
\* A visible button may receive another dispatch while disabled, so correctness
\* does not rely solely on the DOM's suppression of ordinary disabled clicks.
\* A modal guide blocks user clicks on the document until dismissed. Browser
\* events can still arrive then. Promise settlement is not assumed inevitable.

VARIABLES issued, offer, running, spent, reused, installed, standalone,
          topHidden, inlineHidden, topDisabled, inlineDisabled, guide, last

offers == <<issued,offer,running,spent,reused>>
mode == <<installed,standalone>>
visible == <<topHidden,inlineHidden>>
disabled == <<topDisabled,inlineDisabled>>
vars == <<offers,mode,visible,disabled,guide,last>>
Buttons == {"top","inline"}
Outcomes == {"accepted","dismissed","error"}
ClickTag(kind, which) == IF kind = "manual"
                        THEN IF which = "top" THEN "manual-top" ELSE "manual-inline"
                        ELSE IF which = "top" THEN "prompt-top" ELSE "prompt-inline"

\* updateButton() also closes a now-obsolete installation guide.
Render(hide) ==
    /\ topHidden' = hide
    /\ inlineHidden' = topHidden'
    /\ guide' = IF hide THEN "closed" ELSE guide

Init ==
    /\ issued = 0 /\ offer = 0 /\ running = {} /\ spent = {} /\ reused = FALSE
    /\ installed = FALSE /\ standalone \in BOOLEAN
    /\ topHidden = standalone /\ inlineHidden = topHidden
    /\ topDisabled = FALSE /\ inlineDisabled = FALSE /\ guide = "closed"
    /\ last = "initial"

NewOffer ==
    /\ issued < MaxOffers /\ issued' = issued + 1 /\ offer' = issued'
    /\ last' = "offer"
    /\ UNCHANGED <<running,spent,reused,mode,visible,disabled,guide>>

Click(which) ==
    /\ ~(IF which = "top" THEN topHidden ELSE inlineHidden)
    /\ guide = "closed"
    /\ ~topDisabled
    /\ IF offer = 0
       THEN /\ guide' = "manual"
            /\ last' = ClickTag("manual",which)
            /\ UNCHANGED <<offers,disabled>>
       ELSE /\ offer' = 0
            /\ running' = running \cup {offer}
            /\ spent' = spent \cup {offer}
            /\ reused' = (reused \/ offer \in spent)
            /\ topDisabled' = TRUE /\ inlineDisabled' = TRUE
            /\ last' = ClickTag("prompt",which)
            /\ UNCHANGED <<issued,guide>>
    /\ UNCHANGED <<mode,visible>>

Finish(p, result) ==
    /\ p \in running /\ running' = running \ {p}
    /\ installed' = (installed \/ result = "accepted")
    /\ IF result = "accepted" THEN Render(installed' \/ standalone)
       ELSE /\ UNCHANGED visible
            /\ guide' = IF result = "error" /\ ~topHidden THEN "error" ELSE guide
    /\ topDisabled' = FALSE /\ inlineDisabled' = FALSE
    /\ last' = result
    /\ UNCHANGED <<issued,offer,spent,reused,standalone>>

AppInstalled ==
    /\ installed' = TRUE /\ offer' = 0
    /\ Render(TRUE)
    /\ last' = "appinstalled"
    /\ UNCHANGED <<issued,running,spent,reused,standalone,disabled>>

DisplayChange ==
    /\ standalone' = ~standalone
    /\ Render(installed \/ standalone')
    /\ last' = "display"
    /\ UNCHANGED <<offers,installed,disabled>>

CloseGuide ==
    /\ guide # "closed" /\ guide' = "closed" /\ last' = "close"
    /\ UNCHANGED <<offers,mode,visible,disabled>>

Next == NewOffer \/ AppInstalled \/ DisplayChange \/ CloseGuide
        \/ (\E which \in Buttons : Click(which))
        \/ (\E p \in running, result \in Outcomes : Finish(p,result))
Spec == Init /\ [][Next]_vars

TypeOK == /\ issued \in 0..MaxOffers /\ offer \in 0..issued
          /\ spent \subseteq 1..issued /\ running \subseteq spent
          /\ guide \in {"closed","manual","error"}
OneUse == ~reused /\ Cardinality(running) <= 1
LatestOffer == ~installed => offer = (IF issued \in spent THEN 0 ELSE issued)
ControlsLocked == topDisabled = (running # {}) /\ inlineDisabled = topDisabled
Visibility == /\ topHidden = (installed \/ standalone) /\ inlineHidden = topHidden
              /\ (last \in {"accepted","appinstalled"} => topHidden)
GuideCurrent == topHidden => guide = "closed"
Guidance == /\ (last \in {ClickTag("manual",q) : q \in Buttons} => guide = "manual")
            /\ ((last = "error" /\ ~topHidden) => guide = "error")
            /\ (last = "dismissed" => guide = "closed")
            /\ (running # {} => guide = "closed")

TopPrompt == last = ClickTag("prompt","top")
InlinePrompt == last = ClickTag("prompt","inline")
ManualWithNoOffers == issued = 0 /\ last = ClickTag("manual","inline")
RetryAfterSpend == spent # {} /\ last = ClickTag("manual","top")
FreshOfferWhileBusy == running # {} /\ offer # 0
FailureWhileHidden == last = "error" /\ topHidden
============================================================================
