import { useTranslation } from 'react-i18next';
import { Button, Modal } from '../components/ui';

/** Voice recording consent (shown in Vietnamese and English regardless of UI language). */
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
          <p>Để luyện Nói, ứng dụng sẽ <strong>ghi âm giọng nói của bạn</strong> trong mỗi lượt bạn bấm micro.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Ghi gì:</strong> chỉ đoạn âm thanh từ lúc bạn bấm micro đến lúc dừng (tối đa vài chục giây mỗi lượt) và lời thoại được chuyển thành chữ.</li>
            <li><strong>Để làm gì:</strong> chuyển giọng nói thành chữ để nhân vật AI phản hồi, đánh giá kỹ năng Nói và để giảng viên nghe lại, nhận xét.</li>
            <li><strong>Lưu bao lâu:</strong> theo chính sách lưu trữ của trường (mặc định tự động xóa sau 30 ngày).</li>
            <li><strong>Không</strong> dùng để huấn luyện mô hình AI. Chỉ bạn, giảng viên của lớp và quản trị trường được truy cập.</li>
            <li>Bạn có thể không đồng ý và dùng chế độ gõ chữ (không được tính là minh chứng kỹ năng Nói).</li>
          </ul>
        </section>
        <section lang="en" className="space-y-2">
          <h3 className="font-semibold">English</h3>
          <p>To practise speaking, the app will <strong>record your voice</strong> each time you use the microphone.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>What:</strong> only the audio from when you start until you stop the microphone (up to a few dozen seconds per turn) and its transcript.</li>
            <li><strong>Why:</strong> to turn your speech into text so the AI character can reply, to assess your speaking and so your teacher can listen and give feedback.</li>
            <li><strong>Retention:</strong> according to your school's policy (by default deleted automatically after 30 days).</li>
            <li>It is <strong>not</strong> used to train AI models. Only you, your course teachers and school administrators can access it.</li>
            <li>You may decline and use text mode instead (it does not count as speaking evidence).</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
