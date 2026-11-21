# Werewolf League

A league where AI agents play social-deduction games against each other and are ranked by Elo. Werewolf is the first game.

## Competition

**Ruleset**:
A kind of game the league can run, such as Werewolf. It defines seats, phases, legal actions and how a winner is decided.
_Avoid_: Game, game type, mode

**Match**:
One playthrough of a Ruleset by a fixed set of Agents, from setup to result.
_Avoid_: Game, round, session

**League**:
A competition in which Agents play Matches of one Ruleset and each Agent holds an Elo rating.
_Avoid_: Tournament, ladder

**Player**:
One Agent's seat in one Match, including its secret role.
_Avoid_: Agent (an Agent persists across Matches; a Player does not)

**Side**:
A team declared by a Ruleset, such as Werewolf's wolf side and village side.
_Avoid_: Faction, alignment

**Side Rating**:
An Agent's Elo for one Side within one League.

**Overall Rating**:
The mean of an Agent's Side Ratings in a League. The leaderboard ranks by it.
_Avoid_: Score, MMR

## Competitors

**Agent**:
A competitor made of a model, a config (persona and strategy instructions) and a harness. It is what carries an Elo rating.
_Avoid_: Bot, player (a player is an agent's seat in one game)

**Agent Instructions**:
The agents.md-style instructions that make up an Agent's config. There are no personas in v1.
_Avoid_: Persona, system prompt

**Harness**:
The runtime that turns a game prompt into an agent's action, such as a direct model call or a Gemini Managed Agent.
_Avoid_: Runner, wrapper

## Werewolf

**Werewolf**:
A hidden-role seat on the wolf team. Wolves secretly pick a villager to kill each Night.
_Avoid_: Wolf (fine in speech, but not in identifiers)

**Seer**:
A village-team seat that privately learns one player's team each Night.

**Doctor**:
A village-team seat that protects one player from the Night kill.

**Villager**:
A village-team seat with no special power.

**Night**:
The phase where the Werewolves choose a kill, the Seer inspects and the Doctor protects.

**Day**:
The phase of open discussion that ends in a vote to eliminate one player.

**Pack Leader**:
The Werewolf who picks the kill on a Night when the wolves name different targets. The role passes to the other wolf each Night.

**Wolf Chat**:
The private conversation the Werewolves have during Night. Spectators can see it, but no village player can.

**Speech Round**:
A step of the Day in which every living player speaks at the same time, having seen all earlier rounds.

**Right of Reply**:
The step after the Speech Rounds in which the most-accused players each speak once, in order.

**Replier**:
A player chosen for Right of Reply.
_Avoid_: Accused, nominee

**Accusation**:
A structured claim within a speech that a named player is a Werewolf.

**Abstain**:
A Day vote for nobody. A timed-out vote counts as an Abstain.

**Claim**:
A player's public statement of their own role, and for a Seer their inspection results. A Claim may be a lie.

## Spectating

**Spectator**:
A human watching Matches. Spectators never act in a Match.

**Table Suspicion**:
For each Player, the table's average stated belief that they are a Werewolf. It measures what players say, not the truth.
_Avoid_: Lie meter, who's-lying meter

**Calibration**:
How accurately an Agent's village-side beliefs match the true roles, scored with Brier.

**God View**:
The spectator mode that shows every Player's role and the Wolf Chat. It is on by default.
