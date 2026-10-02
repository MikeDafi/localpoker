# Moving LocalPoker to an organization

Written after the 2.3.6 rejection. Apple will not review a play-money poker app
submitted by an individual developer, and every comparable app on the store
ships as a company, so this is the route to being published.

I can research and prepare; I cannot incorporate anything. Forming a company
needs your legal identity, your signature and your money, and the choice of
where and how has tax consequences I am not qualified to advise on. Everything
below is either verified against Apple's own documentation, with the source
named, or flagged as something to confirm.

---

## The thing to know before spending anything

**This app cannot be transferred to the new company.** Apple's app transfer
criteria say:

> The app must have at least one version that was released to the App Store.

LocalPoker has never been released. It has only ever been rejected, so there is
no released version and the existing record is not transferable. The transfer
page also excludes apps currently in `Waiting for Review` or `In Review`, which
is a second reason it is unavailable right now.

So incorporating does **not** let us move app `6815726621`. It means standing a
new one up under the company.

That is cheaper than it sounds, because nothing of value is tied to the old
record: no ratings, no reviews, no installs, no revenue. What is lost is the
bundle identifier, the TestFlight link, and the metadata, and only the first of
those is awkward.

### The bundle identifier

`com.mike0264.localpoker` is registered to the individual team. An explicit
bundle ID cannot be registered by two teams at once, and the company is a
separate team, so the new app needs a different one. Something like
`com.<company>.localpoker`.

For an unreleased app this is a one-line change in `app.json` and a rebuild.
**Do not change it yet**: it would orphan the current TestFlight builds that
testers are using.

Whether the old identifier could be released and reused after deleting the app
record is worth asking App Review rather than assuming. It is not worth waiting
for.

---

## At a glance

Steps 1 to 3 are yours and are mostly waiting. Steps 4 to 8 are mine and are
mostly transcription, because the metadata is already written down in this
folder.

| # | Step | Cost | Time |
|---|---|---|---|
| 1 | Form the entity | CA: filing fee plus an annual minimum franchise tax. Verify current figures, they change | days to a couple of weeks |
| 2 | D-U-N-S number | Free | **the gating item**, allow a couple of weeks |
| 3 | Enrol the organization | Annual membership, separate from the individual one | days, once D-U-N-S clears |
| 4-8 | Bundle ID, app record, metadata, legal pages, TestFlight | Nothing beyond the above | an afternoon |

### The sequencing that actually bites

Steps 1 to 3 are serial, and step 2 is where it stalls if the entity
registration and the D-U-N-S record disagree about the address or the legal
name. So:

- register the entity with the address you intend to use everywhere, including
  on the Privacy Policy, and
- do not start the D-U-N-S request until the registration is genuinely filed
  rather than merely submitted.

Getting those two records to match on the first attempt is the difference
between a fortnight and a month.

### Two things to get right in step 1

The entity name becomes the **public App Store seller name**, so it is a naming
decision rather than a filing detail. And Apple will not accept a DBA or trade
name, so the registered entity is what has to carry it.

## Sequence

Steps 1 to 3 are yours. Step 4 onward I can do.

**1. Form the entity.** Apple requires "a legal entity that can enter into
contracts" and explicitly does not accept "DBAs, fictitious business names,
trade names, or branches". A sole proprietorship does not qualify: Apple's
enrolment page files "sole proprietor/single person business" under enrolling
as an *individual*. So this means an LLC or a corporation.

Worth taking advice on rather than copying what indie developers post online.
The phone number on the review contact is a 650 area code, and California
charges an annual minimum franchise tax on LLCs that is not trivial for a free
app with no revenue. Forming elsewhere does not necessarily avoid it if the
business is run from California. This is exactly the part where an hour with an
accountant is cheaper than a guess.

**2. Get a D-U-N-S Number.** Apple requires one "so that we can verify your
organization's identity, legal entity status, and address". Free from Dun &
Bradstreet via Apple's own lookup form. Allow time: it is not instant, and the
details must match the entity registration exactly.

**3. Enrol the organization in the Apple Developer Program.** You must be able
to bind the company to agreements. The entity name becomes the public seller
name on the App Store, so pick a name you are happy shipping under. The
membership is charged annually and is separate from the individual membership
you already hold.

**4. Register a new bundle ID** under the company's team.

**5. Point the app at it.** Checked, so the blast radius is known:

- `app.json:15` `ios.bundleIdentifier`
- `app.json:23` `android.package`, worth changing together so the two stay in
  step even though Android is not shipping
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, because an iOS OAuth client in Google
  Cloud is bound to a bundle ID and a new one has to be issued
- the GitHub repository secret of the same name, which CI builds read

That is the whole code change. Everything else is account work.

**6. Create the app record** and re-enter metadata. Nothing needs rewriting:
screenshots, description, keywords, review notes, privacy labels and the age
rating are all recorded in this folder and can be re-entered as they stand. The
age rating answer does **not** change: it was accurate, and every comparable
app declares the same thing.

**7. Update the legal pages.** `TERMS.md` and `PRIVACY-POLICY.md` currently say
`Publisher: LocalPoker` with a personal contact address, and deliberately avoid
asserting a governing law because there was no entity to assert one for. Once
there is a company they should name it, give its registered address, and settle
the governing law question. The hosted pages at `mikedafi.github.io/localpoker`
are generated from those files.

**8. Re-establish TestFlight.** New app record means a new public link and
re-inviting testers, including ashleyveenakumar@gmail.com.

---

## What happens to the old account

Leave the existing app record alone until the new one is live, because it is
what is currently serving TestFlight. Once the company's build is in testers'
hands, remove the old submission and the app record.

Keep the individual membership until then. Nothing is gained by cancelling it
early and it is what the current testers depend on.

---

## While this is in progress

TestFlight is unaffected by the rejection. Build 27 is live for up to 10,000
testers through the public link, so the game can keep being played and tested
throughout. Builds expire 90 days after upload, so a fresh build will be needed
if this runs long.

---

## Still worth doing first

`APP-REVIEW-REPLY.md` is drafted and unsent. It costs nothing, changes no
declaration, and asks whether the organization requirement is genuinely
intended for a free play-money game. If the answer is yes, none of the above
changes. If it is no, all of it becomes unnecessary.

Sending it before incorporating is strictly better than after.
