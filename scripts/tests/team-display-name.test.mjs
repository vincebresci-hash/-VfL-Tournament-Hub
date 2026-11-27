import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveTeamDisplayName,
  displayNamesCollide,
  stripAgeGroupSuffix,
} from "../../src/lib/schedule/team-display-name.ts";
import { publicTeamLabel } from "../../src/lib/schedule/names.ts";

test("realistic legacy names are cleaned dynamically", () => {
  assert.equal(deriveTeamDisplayName({ clubName: "FC Nöttingen", teamName: "FC Nöttingen U15" }), "FC Nöttingen");
  assert.equal(deriveTeamDisplayName({ clubName: "SG Sonnenhof Großaspach", teamName: "SG Sonnenhof Großaspach U15" }), "SG Sonnenhof Großaspach");
  assert.equal(deriveTeamDisplayName({ clubName: "SV Böblingen", teamName: "SV Böblingen U15" }), "SV Böblingen");
  assert.equal(deriveTeamDisplayName({ clubName: "SSV Reutlingen U15", teamName: "U15" }), "SSV Reutlingen");
});

test("same-club teams retain meaningful differentiators", () => {
  assert.equal(deriveTeamDisplayName({ clubName: "VfL Kirchheim", teamName: "VfL Kirchheim I" }), "VfL Kirchheim I");
  assert.equal(deriveTeamDisplayName({ clubName: "VfL Kirchheim", teamName: "VfL Kirchheim II" }), "VfL Kirchheim II");
  assert.equal(deriveTeamDisplayName({ clubName: "VfL Kirchheim", teamName: "U15 II" }), "VfL Kirchheim II");
  assert.equal(deriveTeamDisplayName({ clubName: "VfL Kirchheim II", teamName: "U15" }), "VfL Kirchheim II");
});

test("manual override wins without changing source names", () => {
  const source = { clubName: "TV Altenstadt", teamName: "TVAltestadt B2", override: "TV Altenstadt B2" };
  assert.equal(deriveTeamDisplayName(source), "TV Altenstadt B2");
  assert.equal(source.teamName, "TVAltestadt B2");
});

test("age markers are stripped while team codes remain", () => {
  assert.equal(stripAgeGroupSuffix("TSV Ötlingen Bjugend"), "TSV Ötlingen");
  assert.equal(stripAgeGroupSuffix("FV 09 Nürtingen U17"), "FV 09 Nürtingen");
  assert.equal(stripAgeGroupSuffix("U16"), "");
  assert.equal(stripAgeGroupSuffix("VfL Kirchheim 1"), "VfL Kirchheim 1");
  assert.equal(stripAgeGroupSuffix("TV Altenstadt B2"), "TV Altenstadt B2");
});

test("public compatibility helper uses the central display logic", () => {
  assert.equal(publicTeamLabel("FC Nöttingen", "FC Nöttingen U15"), "FC Nöttingen");
  assert.equal(publicTeamLabel("VfL Kirchheim", "VfL Kirchheim II"), "VfL Kirchheim II");
  assert.equal(publicTeamLabel(null, "VfL Kirchheim U13"), "VfL Kirchheim");
  assert.equal(publicTeamLabel(null, null), "Team");
});

test("collision detection never merges distinct identities", () => {
  assert.equal(
    displayNamesCollide(
      { clubName: "TSV Ötlingen", teamName: "TSV Ötlingen Bjugend" },
      { clubName: "TSV Ötlingen", teamName: "TSV Ötlingen Cjugend" },
    ),
    true,
  );
  assert.equal(
    displayNamesCollide(
      { clubName: "VfL Kirchheim", teamName: "VfL Kirchheim I" },
      { clubName: "VfL Kirchheim", teamName: "VfL Kirchheim II" },
    ),
    false,
  );
});
