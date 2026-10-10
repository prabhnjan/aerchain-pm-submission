import { WorkspaceProvider } from "@/components/WorkspaceContext";
import { Workspace } from "@/components/Workspace";
import { BASE_RUN, REFERENCE, LINES, BUYER, QUESTIONNAIRE, TERMS } from "@/lib/state";
import cellsEval from "@/evals/results-cells.json";
import trapsEval from "@/evals/results-traps.json";
import heldoutEval from "@/evals/results-heldout.json";
import heldoutBefore from "@/evals/heldout/results-before-fix.json";
import heldoutG from "@/evals/results-heldout-G.json";
import heldoutGFirst from "@/evals/heldout/results-G-first-run.json";
import heldoutHFirst from "@/evals/heldout/results-H-first-run.json";

export default function Page() {
  return (
    <WorkspaceProvider
      initialRun={BASE_RUN}
      data={{ lines: LINES, buyer: BUYER, questions: QUESTIONNAIRE, terms: TERMS, reference: REFERENCE, evals: { cells: cellsEval, traps: trapsEval, heldout: heldoutEval, heldoutBefore, heldoutG, heldoutGFirst, heldoutHFirst } }}
    >
      <Workspace />
    </WorkspaceProvider>
  );
}
