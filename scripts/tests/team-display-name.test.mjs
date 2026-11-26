import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveTeamDisplayName,
  displayNamesCollide,
  stripAgeGroupSuffix,
} from "../../src/lib/schedule/team-display-name.ts";

test("release examples resolve to the specified display names", () => {
  assert.equal(deriveTeamDisplayName({ clubName: "VfL Kirchheim", teamName: "VfL Kirchheim 1" }), "VfL Kirchheim 1");
  assert.equal(deriveTeamDisplayName({ clubName: "VfL Kirchheim", teamName: "VfL Kirchheim 2" }), "VfL Kirchheim 2");
  assert.equal(deriveTeamDisplayName({ clubName: "SG Sonnenhof Großaspach", teamName: "SGS U16" }), "SG Sonnenhof Großaspach");
  assert.equal(deriveTeamDisplayName({ clubName: "TSV Ötlingen", teamName: "TSV Ötlingen Bjugend" }), "TSV Ötlingen");
  assert.equal(deriveTeamDisplayName({ clubName: "FV 09 Nürtingen", teamName: "FV 09 Nürtingen U17" }), "FV 09 Nürtingen");
  assert.equal(
    deriveTeamDisplayName({ clubName: "TV Altenstadt", teamName: "TVAltestadt B2", override: "TV Altenstadt B2" }),
    "TV Altenstadt B2",
  );
  assert.equal(
    deriveTeamDisplayName({
      clubName: "SGM TSV Neckartenzlingen/TSV Grafenberg",
      teamName: "SGM Neckartenzlingen/Grafenberg",
    }),
    "SGM Neckartenzlingen/Grafenberg",
  );
});

test("manual override always wins", () => {
  assert.equal(
    deriveTeamDisplayName({ clubName: "VfL Kirchheim", teamName: "VfL Kirchheim 1", override: "Löwen" }),
    "Löwen",
  );
});

test("age-group suffixes are stripped but numbers and codes are kept", () => {
  assert.equal(stripAgeGroupSuffix("TSV Ötlingen Bjugend"), "TSV Ötlingen");
  assert.equal(stripAgeGroupSuffix("FV 09 Nürtingen U17"), "FV 09 Nürtingen");
  assert.equal(stripAgeGroupSuffix("SGS U16"), "SGS");
  assert.equal(stripAgeGroupSuffix("VfL Kirchheim 1"), "VfL Kirchheim 1");
  assert.equal(stripAgeGroupSuffix("TV Altenstadt B2"), "TV Altenstadt B2");
  assert.equal(stripAgeGroupSuffix("Team II"), "Team II");
});

test("missing parts fall back sensibly without redundant concatenation", () => {
  assert.equal(deriveTeamDisplayName({ clubName: "VfL Kirchheim", teamName: null }), "VfL Kirchheim");
  assert.equal(deriveTeamDisplayName({ clubName: null, teamName: "VfL Kirchheim U13" }), "VfL Kirchheim");
  assert.equal(deriveTeamDisplayName({ clubName: null, teamName: null }), "Team");
  // No "Club · Club" redundancy.
  assert.equal(deriveTeamDisplayName({ clubName: "VfL Kirchheim", teamName: "VfL Kirchheim" }), "VfL Kirchheim");
});

test("collision detection flags same display without merging distinct teams", () => {
  // Two different teams that would render identically must be flagged (not merged).
  assert.equal(
    displayNamesCollide(
      { clubName: "TSV Ötlingen", teamName: "TSV Ötlingen Bjugend" },
      { clubName: "TSV Ötlingen", teamName: "TSV Ötlingen Cjugend" },
    ),
    true,
  );
  // Distinct numbered teams do NOT collide.
  assert.equal(
    displayNamesCollide(
      { clubName: "VfL Kirchheim", teamName: "VfL Kirchheim 1" },
      { clubName: "VfL Kirchheim", teamName: "VfL Kirchheim 2" },
    ),
    false,
  );
});
