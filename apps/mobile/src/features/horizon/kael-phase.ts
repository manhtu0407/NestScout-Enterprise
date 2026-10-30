export type KaelPhase = 'researching' | 'working' | 'completed';

export const kaelPhases: readonly KaelPhase[] = ['researching', 'working', 'completed'];

export const kaelPhaseLabels: Record<KaelPhase, string> = {
  researching: 'Kael đang nghiên cứu',
  working: 'Kael đang chuẩn bị câu trả lời',
  completed: 'Kael đã trả lời xong',
};

export const kaelIdleLabel = 'Kael đang sẵn sàng';
