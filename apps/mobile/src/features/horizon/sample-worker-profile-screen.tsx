import { useCallback, useState } from 'react';

import {
  certificateStatusLabels, sampleWorkerProfileView, type WorkerProfileCommand, type WorkerProfileTab, type WorkerProfileView,
} from './worker-profile';
import { WorkerProfileScreen } from './worker-profile-screen';

type Props = { initialTab: WorkerProfileTab; onBack: () => void };

export function SampleWorkerProfileScreen({ initialTab, onBack }: Props) {
  const [profile, setProfile] = useState<WorkerProfileView>(sampleWorkerProfileView);

  const perform = useCallback(async (command: WorkerProfileCommand): Promise<string> => {
    switch (command.type) {
      case 'save':
        setProfile(current => ({ ...current, name: command.draft.name, trade: command.draft.trade, area: command.draft.area, experienceYears: command.draft.experienceYears, about: command.draft.about, skills: command.draft.skills }));
        return 'Đã lưu hồ sơ nghề.';
      case 'coverage':
        setProfile(current => ({ ...current, radiusKm: command.radiusKm, serviceIds: command.serviceIds }));
        return 'Đã lưu khu vực và dịch vụ nhận.';
      case 'accepting':
        setProfile(current => ({ ...current, accepting: command.accepting }));
        return command.accepting ? 'Đã bật nhận việc.' : 'Đã tắt nhận việc.';
      case 'addCertificate':
        setProfile(current => ({
          ...current,
          certificates: [...current.certificates, { id: `sample-${current.certificates.length + 1}`, title: command.title, status: 'pending', statusLabel: certificateStatusLabels.pending }],
        }));
        return 'Đã thêm chứng chỉ. Khách chỉ thấy chứng chỉ sau khi được xác minh.';
      default:
        setProfile(current => ({ ...current, certificates: current.certificates.filter(item => item.id !== command.id) }));
        return 'Đã xóa chứng chỉ.';
    }
  }, []);

  return <WorkerProfileScreen sample initialTab={initialTab} profile={profile} fallbackName={sampleWorkerProfileView.name} perform={perform} onBack={onBack} />;
}
