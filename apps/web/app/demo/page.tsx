import type { Metadata } from 'next';
import { DemoExperience } from './demo-experience';

export const metadata: Metadata = {
  title: '공개 합성 데모 | 돈워리',
  description: '운영 데이터와 분리된 돈워리 금융사기 공동대응 시나리오 데모',
};

export default function DemoPage() {
  return <DemoExperience />;
}
