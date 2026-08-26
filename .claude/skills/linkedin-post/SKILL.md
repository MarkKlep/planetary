---
name: linkedin-post
description: Draft a LinkedIn post about a project, launch, release, lesson learned, or piece of work. Use whenever someone asks for a LinkedIn post, a "post about this on LinkedIn", a launch announcement, a build-in-public update, or wants an existing draft rewritten, shortened, or made less generic.
---

# Writing a LinkedIn post

The default LinkedIn post is unreadable: a one-word hook, twelve one-line paragraphs,
three rocket emoji and a claim nobody can check. It reads as generic because it *is*
generic — nothing in it could only have been written about this particular thing.

The whole job is finding the specifics that only this work has, and then getting out of
their way.

## 1. Get the material before writing a word

Never draft from the request alone. Go and read the thing.

- A repo: `README`, `CLAUDE.md`/`AGENTS.md`, the commit log (`git log --oneline | wc -l`,
  first and last commit dates), the source tree, line counts. Look for the design notes
  and the "why we did it this odd way" comments — that is where the post is.
- A shipped feature: what it replaced, what it costs, what it measures.
- A lesson learned: what was actually tried, what actually broke, what the number was.

You are hunting for **four or five concrete, checkable facts**. Real numbers, real
constraints, real trade-offs, the surprising detail. If you cannot find any, say so and
ask — do not paper over the gap with adjectives.

## 2. Pick one angle

A post makes **one** point. Choosing the angle is the decision; everything else follows.

| Angle | Works when | Opens with |
| --- | --- | --- |
| **The surprising fact** | The work contains a detail that makes people go "huh" | The fact itself |
| **The constraint** | Something impossible-sounding forced an interesting solution | The impossibility |
| **The wrong assumption** | You believed something, it was wrong, and the correction is useful | What you believed |
| **The build log** | The scope itself is the story — long project, real scale | Where it started vs. where it is |
| **The number** | One measurement carries everything | The number, bare |

If two angles are both good, write the post about one and keep the other for next time.
Two angles in one post gives you neither.

## 3. Structure

**The first two lines are the entire post's audience.** LinkedIn truncates at roughly
200 characters behind a "…more" link, and the feed scrolls. Everything after that line is
read only by people the first line earned.

So: no throat-clearing. Not "I'm excited to share", not "After months of hard work", not
a question the reader has no reason to care about yet. Open with the most specific,
most surprising true sentence you have.

Then:

- **Body** — three to six short paragraphs. Each one carries a fact, not a feeling.
  Concrete beats abstract every time: "the horizon is 2.4 km away" beats "physically
  accurate".
- **Close** — one line. A link, an invitation, or an honest open question. Not a
  motivational summary of what the reader just read.

## 4. Voice

Write the way you would explain it to a competent colleague who does not work on it.

**Cut on sight:**

- "I'm thrilled/excited/humbled to announce"
- "Game-changer", "leverage", "seamless", "robust", "cutting-edge", "passionate about"
- Em-dash-heavy rhetorical pairs and "It's not just X, it's Y"
- Rhetorical questions used as transitions ("The result? …")
- Any sentence that would survive unchanged in a post about a different project
- Emoji as bullet points. One or two in a whole post is a lot.
- Hashtag piles. Three at most, at the end, and only real ones.

**Keep:**

- Numbers with units
- Names of real things (the algorithm, the library, the standard, the file)
- What was hard, stated plainly
- What is *not* done, when it is interesting
- Contractions and short sentences

**Credit and honesty.** If tools, AI, or other people did part of the work, say so in a
clause and move on. If a number is approximate, say approximately. A post that overclaims
is worse than no post, because the audience is peers who can check.

## 5. Formatting mechanics

LinkedIn does **not render Markdown**. No `**bold**`, no `#` headings, no `-` bullets
that turn into anything. What you type is what appears.

- Separate paragraphs with a blank line. One to three sentences each.
- For a list, use a plain character (`—`, `·`) at the line start, or just write prose.
  Prose is usually better.
- Links are fine in the body, but LinkedIn suppresses reach on posts with outbound links.
  If reach matters, put the link in the first comment and say so in the post.
- Total length: **150–300 words** is the working range. Under 150 rarely earns the click;
  over 400 gets skimmed. A build-log post can go longer if the specifics justify it.
- No leading tabs or trailing double spaces — they survive the paste and look broken.

## 6. Deliver it

Output the post as **plain text ready to paste**, in a fenced block so nothing is
reformatted on the way out. Do not wrap it in commentary the user has to strip.

Offer, briefly, one thing after it: an alternate hook, a shorter cut, or the
first-comment link line. One offer, not a menu.

## Checklist before handing it over

- [ ] Line 1 works as the whole post if nothing else is read
- [ ] At least three facts a reader could go and verify
- [ ] Nothing in it would survive being pasted into a post about a different project
- [ ] No announcement clichés, no hashtag pile, no emoji bullets
- [ ] Markdown-free — it will paste correctly
- [ ] Under 300 words unless the specifics earn more
- [ ] Every claim is true, including the ones about how easy it was
