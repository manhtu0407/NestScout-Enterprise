import { useSampleWorkerJobs } from './use-sample-worker-jobs';
import type { WorkerJobStage } from './worker-jobs';
import { WorkerJobsScreen } from './worker-jobs-screen';

type Props = { initialStage: WorkerJobStage; onBack: () => void; onAskKael?: () => void };

export function SampleWorkerJobsScreen({ initialStage, onBack, onAskKael }: Props) {
  const { jobs, perform } = useSampleWorkerJobs();
  return <WorkerJobsScreen sample initialStage={initialStage} jobs={jobs} perform={perform} onBack={onBack} onAskKael={onAskKael} />;
}
