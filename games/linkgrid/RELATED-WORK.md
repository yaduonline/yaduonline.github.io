# Linkgrid — the generator against the literature

A written-up comparison of the puzzle generator in `tools/` with published work
on Numberlink, path partitions, and procedural content generation.

**Verdict up front: none of this is new.** Every component has clear prior art,
and in two places the literature contains results that are strictly stronger
than what this generator achieves. The write-up below says where each piece
comes from, what the one arguably-unusual combination is, and what would have to
be true for any of it to count as research.

---

## 1. The problem, stated properly

A Linkgrid puzzle is an instance of what the literature calls **Zig-Zag
Numberlink**, or in graph terms the *k vertex-disjoint covering paths* problem:

> Given a grid graph `G = (V, E)` and `k` terminal pairs `(s_i, t_i)`, find `k`
> vertex-disjoint paths, path `i` joining `s_i` to `t_i`, whose vertex sets
> partition `V`.

The coverage requirement — every cell used — is what separates it from classical
Numberlink and from Robert Lynch's 1975 disjoint-paths hardness result.

**Complexity.** Adcock, Demaine, Demaine, O'Brien, Reidl, Sánchez Villaamil and
Sullivan proved this covering variant NP-complete (*Zig-Zag Numberlink is
NP-Complete*, Journal of Information Processing 23(3), 2015; arXiv:1410.5845).
Kotsuma and Takenaga (2010) had earlier proved NP-completeness for the variant
where paths must take the fewest corners in their homotopy class. So generation
is search against an NP-complete acceptance test — which is exactly why this
generator builds a solution first and derives the puzzle from it, rather than
placing dots and hoping.

**The "well-designed" convention.** A Numberlink puzzle is conventionally called
well-designed when it has a unique solution, every cell is covered, and no path
runs alongside itself. That third clause is not an aesthetic choice I invented;
it is the standard convention, and it is what makes uniqueness attainable at
sensible colour counts. Section 4 has the measurements.

**The object being searched for** also has a name. A set of paths that partitions
the vertices such that no path is adjacent to itself is an **induced path
partition**. Chartrand et al. introduced the induced-path number; the problem is
NP-complete in general. This matters in section 6.

---

## 2. What the generator actually does

Four stages, in `tools/`:

1. **Start feasible.** One straight route per row: already an induced path
   partition of the whole grid.
2. **Anneal** (`generate.js: anneal`). Simulated annealing whose only move
   transfers the cell at one end of a route to a neighbouring route that can
   legally extend to it. The move preserves coverage, contiguity, and the induced
   property, so *every state visited is a valid solution*. The objective rewards
   interior bends, caps bends per route, and penalises imbalance among the four
   corner orientations.
3. **Explore** (`generate.js: explorePool`). Basin hopping: kick with a
   zero-weight random walk over legal moves, polish with a cool anneal, step
   whenever the result is at least 0.6× as hard as the current point. Collect
   every distinct valid puzzle passed through.
4. **Verify and rate** (`solver.js`). Exhaustive DFS with dead-end,
   stranded-region and reachability pruning, counting solutions under the
   no-self-touch rule; keep only the uniquely-solvable. Re-solve with most
   pruning disabled and use the node count as the difficulty rating.

---

## 3. Component-by-component provenance

| Component | Prior art | Assessment |
| --- | --- | --- |
| Generate the solution first, derive dots from it | Standard for Numberlink; stated as the usual method in the general references and used by every hobby generator I found | Not novel |
| Require full coverage + uniqueness + no self-touching | The standard "well-designed" convention | Not novel |
| No-self-touch enforced during *generation* | `thomasahle/numberlink` rejects any cell with three same-coloured neighbours — the same condition | Not novel |
| Solver: dead-end pruning, stranded-region via connected components | Matt Zucker's Flow solver uses both, plus a chokepoint prune this generator lacks | Not novel; mine is weaker |
| Random Hamiltonian path by backbite | Mansfield's backbite move (1982, polymer melts; 2006, unbiased sampling of lattice Hamilton path ensembles) | Not novel — and I abandoned it (§5) |
| Simulated annealing over a feasible region | Textbook metaheuristic | Not novel |
| Basin hopping / kick-and-polish | Wales & Doye (1997); the discrete form is Iterated Local Search (Lourenço, Martin, Stützle) | Not novel |
| Difficulty = solver search effort | Standard. Sudoku's `tdoku` rates puzzles by the number of guesses an MRV backtracking solver makes; rating zero means propagation alone suffices | Not novel |
| Searching instance space for *hard* instances | An established line: evolving difficult TSP instances (van Hemert), evolving hard SAT instances, Ashlock on difficulty-targeted puzzle generation | Not novel |
| The overall shape | Search-Based Procedural Content Generation (Togelius, Yannakakis, Stanley, Browne): direct representation, simulation-based fitness. Textbook case | Not novel |

The honest summary of that table: this is a competent engineering synthesis of
about eight well-known techniques. There is no new mathematics in it.

---

## 4. The one combination I could not find published

Existing Numberlink generators I examined are **generate-and-test**: build a
candidate, check it, discard it if it fails, start over. This generator instead
does **local search inside the feasible region** — the endpoint-transfer move is
chosen precisely so that coverage, contiguity and the induced property are
invariants, so nothing is ever discarded for infeasibility and the annealer can
optimise puzzle *aesthetics* (bend placement, corner variety) directly.

Searching in the space of induced path partitions of a grid, with a move set that
preserves the partition property, is the one thing I did not find written up for
Numberlink specifically.

I am not claiming it as novel, for three reasons:

- Absence from search results is weak evidence, especially for a technique that
  hobbyist generators would plausibly reach and never publish.
- Every ingredient (feasible-region local search, invariant-preserving move sets)
  is standard operations-research practice. Applying it here is an application,
  not an insight.
- It is not obviously *better*. I never benchmarked it against a SAT-based
  generator, which is the obvious strong baseline (a 2025 Leiden thesis covers
  SAT-based Numberlink generation directly). Without that comparison there is no
  claim to make.

---

## 5. Two measured findings worth keeping

These are engineering observations, not theorems, but they were surprising enough
to be worth recording — and both are stated with the numbers that produced them.

**Cutting a random Hamiltonian path is a trap.** The natural construction —
generate a random space-filling path with backbite, cut it into `k` segments — is
what I tried first, and it produces excellent bend statistics. It is also
unusable: a space-filling path necessarily runs alongside itself, so *no* segment
partition is an induced path partition, and uniqueness collapses. Measured: an
8×8 with ten colours admitted 16–252 distinct solutions; a 10×10 with twelve
colours, thousands. Forcing uniqueness by adding cuts needed 20–28 colours on a
10×10. Under the no-self-touch rule the same instances had **zero** solutions.
This is a concrete illustration of why the standard convention exists.

**A bend-maximising objective has a degenerate optimum.** Rewarding interior
bends without further constraint drives the annealer to partitions made entirely
of diagonal staircases: maximal bend count (0.63 bends per cell), and only two of
the four corner orientations present — 20 up-right, 20 down-left, 0 of each
other. Visually every puzzle looks identical. Two terms fix it: a cap on bends
credited per route (half its cells), and a global penalty on the spread between
the most and least common corner orientation. Post-fix the shipped set has all
four orientations with no orientation above 40% of bends.

The second is the kind of thing that is obvious in hindsight and genuinely useful
to anyone writing an aesthetic objective over a combinatorial structure. It is
still not research.

---

## 6. Where the literature beats this generator

**Colour counts.** Chartrand et al. showed that the induced path partition number
of a grid `P_m × P_n` is **2** — every square grid can be split into just two
non-self-touching paths. My generator's floor is around `N − 3` colours on an
`N × N` board, because the starting partition is one route per row and the
transfer move cannot reduce the count; `mergeDown` recovers a few by joining
routes that touch at exactly one pair of ends, and then runs dry. So the colour
floor in `tools/generate.js` is an artifact of my move set, not a property of the
space. A generator that could reach low `k` would produce much harder puzzles
than anything I shipped. That is a real, known-in-the-literature limitation.

**Uniqueness checking.** I use exhaustive DFS. SAT with a cardinality encoding
and a blocking clause is the standard, and near-certainly faster at 10×10 and
above; the Copris Numberlink solver offers uniqueness checking directly. My
10×10 pool took 21 minutes largely because of solver cost.

**Difficulty as a construct.** My rating is solver nodes under weakened pruning.
It has never been validated against a human. The Sudoku literature is well ahead
here — there is a body of work on difficulty rating, including evaluations of how
well solver-effort metrics correlate with human-perceived difficulty. I have one
data point: you reported that the previous ceiling felt like "difficulty 2 to 3",
which the metric ranked as its own maximum. That is consistent, and it is one
data point.

**Ergodicity.** Whether repeated backbite moves reach every Hamiltonian path is
an open problem. My transfer-move chain over induced path partitions has no
mixing analysis at all — I have not shown it can reach every partition, and the
colour-floor problem above suggests it cannot.

---

## 7. What would make this research

Roughly, in ascending order of effort:

1. Benchmark against a SAT-based generator on time-to-generate and on the
   difficulty distribution reached. Without this there is no evidence the
   feasible-region search is worth anything.
2. Characterise the reachability of the transfer-move chain over induced path
   partitions of a grid. Does it connect the space? The `ρ_p = 2` result says the
   space is far larger than my chain visits.
3. Validate the difficulty metric against human solve times. This is the part
   that would actually be useful to puzzle designers, and it needs players, not
   solvers.
4. State the aesthetic-objective degeneracy as a general phenomenon rather than
   an anecdote about staircases.

None of that is done here.

---

## 8. Conclusion

This is a well-engineered, thoroughly-verified puzzle generator built out of
standard parts: solution-first construction, the conventional well-designed
criteria, simulated annealing over a feasible region, basin hopping, and
solver-effort difficulty rating. It produces 600 puzzles that provably cover
their boards and provably have unique clean solutions, with measured bend
statistics, and it does so reproducibly from a seed.

It is not a research contribution, and the literature contains at least one
result (`ρ_p(P_m × P_n) = 2`) that directly exposes a limitation in it.

---

## References

Consulted while writing this. Where I could only read an abstract or a secondary
description, that is noted.

- Adcock, Demaine, Demaine, O'Brien, Reidl, Sánchez Villaamil, Sullivan.
  *Zig-Zag Numberlink is NP-Complete*. J. Information Processing 23(3):239–245,
  2015. [arXiv:1410.5845](https://arxiv.org/abs/1410.5845)
- Kotsuma, Takenaga. NP-completeness of Numberlink with minimum-corner paths,
  2010. *(via the Adcock et al. related-work discussion, not read directly)*
- Chartrand et al., induced-path number, incl. `ρ_p(P_m × P_n) = 2`. *(via
  [Revisiting path-type covering and partitioning problems](https://arxiv.org/pdf/1807.10613),
  which surveys it; the original was not read directly)*
- [Parameterizing Path Partitions](https://arxiv.org/abs/2212.11653) — complexity
  of induced and shortest path partition problems.
- Mansfield. *Unbiased sampling of lattice Hamilton path ensembles*, J. Chem.
  Phys., 2006; backbite introduced 1982. See also
  [ndmansfield](https://github.com/jewettaij/ndmansfield).
- Wales, Doye. Basin-hopping, 1997. Discrete analogue: Iterated Local Search
  (Lourenço, Martin, Stützle).
- Togelius, Yannakakis, Stanley, Browne. *Search-Based Procedural Content
  Generation: A Taxonomy and Survey*.
- Kegel, Haahr. *Procedural Puzzle Generation: A Survey*.
- van Hemert. *Evolving Combinatorial Problem Instances That Are Difficult to
  Solve*.
- [thomasahle/numberlink](https://github.com/thomasahle/numberlink) — generator
  and solver; the `has_tripple` self-touch check.
- [Matt Zucker, Flow Free solver](https://mzucker.github.io/2016/08/28/flow-solver.html)
  — dead-end, stranded-cell and chokepoint pruning.
- [How to solve and generate Numberlink puzzles using SAT](https://theses.liacs.nl/pdf/2025-2026-LelipalyJJoshua.pdf),
  Leiden, 2025. *(located but not readable as text; cited as the obvious SAT
  baseline, not as a source of specific claims)*
- [Copris Numberlink solver](https://cspsat.gitlab.io/copris-puzzles/numberlink/)
  — SAT-based, with uniqueness checking.
- `tdoku` difficulty rating — guesses made by an MRV backtracking solver.
- [Difficulty Rating of Sudoku Puzzles: An Overview and Evaluation](https://arxiv.org/pdf/1403.7373).
