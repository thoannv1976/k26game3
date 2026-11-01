import { useTranslation } from 'react-i18next';
import { Button, Modal } from '../components/ui';

/** Voice recording notice (shown in Vietnamese and English regardless of UI language). */
export function ConsentModal({ open, onClose, onAgree, loading }: { open: boolean; onClose: () => void; onAgree: () => void; loading?: boolean }) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('consent.title')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('consent.decline')}
          </Button>
          <Button onClick={onAgree} loading={loading} data-testid="consent-agree">
            {t('consent.agree')}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 text-sm leading-relaxed md:grid-cols-2">
        <section lang="vi" className="space-y-2">
          <h3 className="font-semibold">Tiếng Việt</h3>
          <p>Để luyện Nói, ứng dụng sẽ <strong>ghi âm giọng nói của bạn</strong> trong mỗi phần thi Nói.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Ghi gì:</strong> chỉ đoạn âm thanh từ lúc bắt đầu đến lúc dừng ghi âm của từng phần, và lời nói được chuyển thành chữ.</li>
            <li><strong>Để làm gì:</strong> chuyển giọng nói thành chữ, AI chấm sơ bộ (nội dung, từ vựng, ngữ pháp), đo độ trôi chảy và để giảng viên nghe lại, thẩm định (phát âm do giảng viên chấm).</li>
            <li><strong>Lưu bao lâu:</strong> theo chính sách lưu trữ của trường, sau đó tự động xóa.</li>
            <li><strong>Không</strong> dùng để huấn luyện mô hình AI. Chỉ bạn, giảng viên của lớp và quản trị trường được nghe.</li>
          </ul>
        </section>
        <section lang="en" className="space-y-2">
          <h3 className="font-semibold">English</h3>
          <p>To practise speaking, the app will <strong>record your voice</strong> in each speaking part.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>What:</strong> only the audio from when a recording starts until it stops, and its transcript.</li>
            <li><strong>Why:</strong> to transcribe your speech, give preliminary AI feedback (content, vocabulary, grammar), measure fluency, and so your teacher can listen and review (pronunciation is scored by your teacher).</li>
            <li><strong>Retention:</strong> according to your school's policy, then deleted automatically.</li>
            <li>It is <strong>not</strong> used to train AI models. Only you, your course teachers and school administrators can listen to it.</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
