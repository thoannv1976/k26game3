# Đặc tả gốc – Game 3: VSTEP Quest – AI English Championship

> Trích nguyên văn từ tài liệu "K26 - Apps và thư mời GPT.docx" (phần "Viết mô tả game 3…"). Chỉ bỏ hình minh họa và sửa đường dẫn API bị mất `:id`. Kế hoạch: [../../PLAN.md](../../PLAN.md).


**GAME 3: VSTEP QUEST – AI English Championship**

Đặc tả phần mềm để chuyển cho Claude Code xây dựng, đưa mã nguồn lên GitHub và sử dụng Claude Cowork triển khai trên Google Cloud Platform (GCP), Firebase và Firestore.

VSTEP Quest là trò chơi mô phỏng đấu trường tiếng Anh, giúp sinh viên luyện tập bốn kỹ năng Nghe, Nói, Đọc và Viết thông qua các thử thách, nhiệm vụ và cuộc thi giữa các sinh viên hoặc các lớp.


Game có ba điểm khác biệt so với hai phần mềm trước:

- VSTEP Quest: Luyện tập tổng hợp bốn kỹ năng, tự động đánh giá tiến độ, thi đấu và quản lý kết quả.

- English City Simulator: Tập trung vào luyện giao tiếp Nghe – Nói qua các tình huống đời sống.

- English Detective: Tập trung vào Đọc – Viết, phân tích bằng chứng và giải quyết vấn đề.

VSTEP Quest sẽ kết nối dữ liệu của cả ba game với LMS-AI9 và AI English Learning Portfolio. Kết quả luyện tập được phân biệt với điểm thi chính thức; AI hỗ trợ đánh giá sơ bộ bài Nói, Viết, còn giảng viên thực hiện chấm thẩm định khi cần.

**TÀI LIỆU ĐẶC TẢ PHẦN MỀM**

**VSTEP QUEST – AI ENGLISH CHAMPIONSHIP**

**Trò chơi mô phỏng đấu trường tiếng Anh, ôn luyện 4 kỹ năng tích hợp AI**

- Phiên bản: 1.0

- Đối tượng: Sinh viên đại học, trình độ B1–B2

- Nền tảng: Web Application

- Công nghệ: React, TypeScript, Google Cloud Platform, Firebase, Firestore, Gemini AI

- Công cụ phát triển: Claude Code

- Quản lý mã nguồn: GitHub

- Triển khai: Google Cloud và Firebase với sự hỗ trợ của Claude Cowork

- Tích hợp: LMS-AI9, English City Simulator, English Detective và AI English Learning Portfolio

**I. MỤC TIÊU PHẦN MỀM**

**1. Mục tiêu**

Xây dựng một trò chơi trực tuyến mô phỏng đấu trường tiếng Anh, cho phép sinh viên luyện tập toàn diện bốn kỹ năng Nghe, Nói, Đọc, Viết thông qua các nhiệm vụ và thử thách.

Các hoạt động được thiết kế theo định hướng B1–B2 và định dạng các bài thi VSTEP.

Game tích hợp AI nhằm:

- Hỗ trợ tạo câu hỏi và bài luyện tập.

- Hướng dẫn và giải thích đáp án.

- Hỗ trợ đánh giá kỹ năng Viết và Nói.

- Phân tích điểm mạnh, điểm yếu.

- Đề xuất lộ trình ôn luyện cá nhân hóa.

- Cung cấp dữ liệu cho hệ thống LMS-AI9 và AI English Learning Portfolio.

Phần mềm không chỉ là hệ thống thi trắc nghiệm có tính điểm mà phải có các yếu tố của trò chơi: bản đồ, nhân vật, nhiệm vụ, thử thách, cấp độ, huy hiệu, bảng xếp hạng và giải đấu.

**2. Đối tượng sử dụng**

Hệ thống có bốn nhóm người dùng.

**Sinh viên**

- Tạo nhân vật đại diện.

- Lựa chọn nhiệm vụ.

- Tham gia thử thách.

- Luyện tập bốn kỹ năng.

- Nhận phản hồi từ AI.

- Tham gia các cuộc thi do giảng viên tổ chức.

- Theo dõi sự tiến bộ của bản thân.

**Giảng viên**

- Quản lý lớp học.

- Xây dựng ngân hàng câu hỏi.

- Tạo nhiệm vụ và giải đấu.

- Phân công bài luyện tập.

- Theo dõi tiến độ.

- Thẩm định kết quả đánh giá của AI.

- Xuất báo cáo.

**Quản trị viên nhà trường**

- Quản lý người dùng, khoa, lớp và học phần.

- Quản lý nội dung.

- Cấu hình AI.

- Thiết lập giới hạn sử dụng.

- Theo dõi chi phí.

- Phân tích dữ liệu học tập.

**Quản trị viên nền tảng**

- Quản lý cấu hình kỹ thuật.

- Quản lý các trường đại học.

- Quản lý phiên bản.

- Giám sát hệ thống và vận hành.

Hệ thống phải hỗ trợ kiến trúc nhiều trường đại học (multi-tenant) và phân tách dữ liệu.

**II. THIẾT KẾ THẾ GIỚI TRÒ CHƠI**

**1. VSTEP Quest World**

Thiết kế một thế giới ảo có bốn khu vực thử thách tương ứng với bốn kỹ năng.

Tên các khu vực:

1.  Listening Island – Đảo Nghe.

2.  Reading Castle – Lâu đài Đọc.

3.  Writing Academy – Học viện Viết.

4.  Speaking Arena – Đấu trường Nói.

Các khu vực được kết nối trên một bản đồ ảo.

Sinh viên lựa chọn khu vực để tham gia nhiệm vụ hoặc di chuyển theo lộ trình do giảng viên thiết lập.

Bản đồ sử dụng đồ họa 2D/2.5D hoặc isometric, tối ưu cho trình duyệt web và điện thoại.

Không cần phát triển trò chơi 3D thời gian thực ở phiên bản đầu tiên.

**2. Nhân vật đại diện**

Mỗi sinh viên có một nhân vật ảo (Avatar).

Sinh viên có thể:

- Chọn nhân vật.

- Thay đổi hình đại diện.

- Theo dõi cấp độ.

- Nhận huy hiệu.

- Xem thành tích.

Điểm kinh nghiệm và các phần thưởng được sử dụng để mở khóa nhiệm vụ hoặc những yếu tố giao diện.

Không triển khai giao dịch mua bán vật phẩm trong phiên bản đầu tiên.

**3. Bốn trạm thử thách**

**Trạm 1: Listening Island**

Sinh viên tham gia các nhiệm vụ nghe hiểu.

Các dạng nhiệm vụ:

- Nghe hội thoại ngắn.

- Nghe đoạn hội thoại dài.

- Nghe bài nói hoặc bài thuyết trình.

- Xác định thông tin.

- Nghe và suy luận.

- Hoàn thành nhiệm vụ dựa trên nội dung nghe.

Hệ thống tự động chấm các câu hỏi có đáp án xác định.

Sau khi hoàn thành, AI giải thích đáp án, xác định những nội dung sinh viên nghe chưa chính xác và đề xuất bài luyện tập tiếp theo.

**Trạm 2: Reading Castle**

Sinh viên giải quyết những thử thách đọc hiểu.

Các nhiệm vụ:

- Đọc email, thông báo và tin tức.

- Đọc văn bản học thuật.

- Tìm kiếm thông tin.

- Xác định ý chính.

- Suy luận và phân tích.

- Giải quyết các câu đố dựa trên văn bản.

Hệ thống tự động chấm trắc nghiệm và các câu hỏi có đáp án xác định.

AI cung cấp giải thích, phân tích những câu trả lời sai và gợi ý kỹ năng đọc hiểu cần cải thiện.

**Trạm 3: Writing Academy**

Sinh viên thực hiện các nhiệm vụ viết tiếng Anh.

Các nhiệm vụ:

- Viết email.

- Viết thư.

- Viết báo cáo ngắn.

- Viết bài luận.

- Trình bày và bảo vệ quan điểm.

AI hỗ trợ đánh giá sơ bộ bài viết theo rubric.

AI không viết thay bài cho sinh viên trong chế độ kiểm tra.

Giảng viên có quyền xem lại bài viết, kết quả AI và thực hiện chấm thẩm định.

**Trạm 4: Speaking Arena**

Sinh viên thực hiện các nhiệm vụ nói.

Các thử thách:

- Giới thiệu bản thân và giao tiếp xã hội.

- Trả lời câu hỏi theo chủ đề.

- Lựa chọn và thảo luận giải pháp.

- Trình bày quan điểm.

- Phát triển chủ đề và trả lời câu hỏi mở rộng.

Sinh viên nghe hoặc đọc yêu cầu, chuẩn bị câu trả lời và ghi âm trực tiếp.

Hệ thống lưu bài nói, chuyển giọng nói thành văn bản và sử dụng AI để hỗ trợ đánh giá sơ bộ.

Kết quả đánh giá phải thể hiện rõ các tiêu chí đã có đủ dữ liệu để đánh giá và những tiêu chí cần giảng viên thẩm định.

**III. BA CHẾ ĐỘ CHƠI**

**1. Quest Mode – Phiêu lưu ôn luyện**

Chế độ luyện tập cá nhân.

Sinh viên lựa chọn kỹ năng, cấp độ và nhiệm vụ.

Quy trình:

1.  Chọn khu vực.

2.  Nhận nhiệm vụ.

3.  Hoàn thành thử thách.

4.  Nhận điểm.

5.  Xem giải thích và phản hồi.

6.  Nhận phần thưởng.

7.  Mở khóa nhiệm vụ tiếp theo.

Sinh viên có thể làm lại các nhiệm vụ theo quy định.

Ở chế độ này, AI được phép hỗ trợ giải thích và hướng dẫn sau khi sinh viên trả lời.

**2. Mock Exam Mode – Thi thử theo định dạng VSTEP**

Sinh viên tham gia bài thi thử gồm bốn kỹ năng theo cấu trúc đề thi do nhà trường lựa chọn và phê duyệt.

Hệ thống hỗ trợ:

- Quản lý ngân hàng đề thi.

- Tạo đề thi theo cấu trúc đã cấu hình.

- Giới hạn thời gian.

- Ghi nhận câu trả lời.

- Ghi âm bài nói.

- Chấm tự động Nghe và Đọc.

- AI chấm sơ bộ Viết và Nói.

- Giảng viên chấm thẩm định khi cần.

- Tổng hợp kết quả.

Cấu trúc đề, số câu hỏi, thời lượng, thang điểm và rubric cần được cấu hình theo đặc tả VSTEP mà nhà trường áp dụng và được bộ phận chuyên môn xác nhận.

Các bài thi thử không được giới thiệu là kỳ thi cấp chứng chỉ VSTEP chính thức.

Trong chế độ này, tắt những tính năng trợ giúp có thể ảnh hưởng đến kết quả như gợi ý AI, giải thích đáp án trong khi làm bài hoặc quyền xem dữ liệu đáp án.

**3. Championship Mode – Giải đấu tiếng Anh**

Giảng viên tổ chức các cuộc thi ôn luyện cho sinh viên.

Hỗ trợ:

- Thi đấu cá nhân.

- Thi đấu theo lớp.

- Thi đấu theo đội.

- Bảng xếp hạng.

- Điểm thưởng.

- Huy hiệu.

- Báo cáo thành tích.

Phiên bản 1.0 tập trung vào giải đấu bất đồng bộ: giảng viên mở giải đấu, quy định nhiệm vụ và thời hạn, sinh viên hoàn thành trong khoảng thời gian cho phép.

Thi đấu đồng thời theo thời gian thực và các giải đấu liên trường sẽ được phát triển ở phiên bản sau.

Bảng xếp hạng sử dụng điểm trò chơi được tính theo quy tắc chung. Điểm bài Nói và Viết đang chờ giảng viên thẩm định không được tự động sử dụng để quyết định kết quả giải đấu chính thức.

**IV. NGÂN HÀNG NHIỆM VỤ PHIÊN BẢN 1.0**

Xây dựng tối thiểu tám nhiệm vụ mẫu hoàn chỉnh, gồm hai nhiệm vụ cho mỗi kỹ năng.

| **Mã** | **Khu vực** | **Nhiệm vụ**                      | **Cấp độ** |
|--------|-------------|-----------------------------------|------------|
| L01    | Listening   | Airport Announcements             | B1         |
| L02    | Listening   | University Lecture                | B2         |
| R01    | Reading     | International Student Life        | B1         |
| R02    | Reading     | Technology and Society            | B2         |
| W01    | Writing     | Responding to an Email            | B1         |
| W02    | Writing     | Discussing an Educational Issue   | B2         |
| S01    | Speaking    | Everyday Social Communication     | B1         |
| S02    | Speaking    | Discussing Solutions to a Problem | B2         |

Mỗi nhiệm vụ cần có:

- Tên.

- Mã nhiệm vụ.

- Kỹ năng.

- Trình độ.

- Mục tiêu học tập.

- Hướng dẫn.

- Thời lượng.

- Nội dung.

- Tiêu chí đánh giá.

- Quy tắc tính điểm.

- Phản hồi và khuyến nghị.

Ngoài tám nhiệm vụ, phiên bản đầu tiên phải cung cấp tối thiểu một bộ bài thi thử tích hợp bốn kỹ năng, có cấu trúc và nội dung được giảng viên phê duyệt.

Không sử dụng trái phép những tài liệu hoặc đề thi có bản quyền.

**V. KỊCH BẢN MẪU**

**Nhiệm vụ L01: Airport Announcements**

Sinh viên đang ở sân bay quốc tế và cần xác định những thông tin quan trọng để không bỏ lỡ chuyến bay.

Hệ thống phát các thông báo tiếng Anh được tạo và kiểm duyệt trước.

Sinh viên phải nghe và xác định:

- Flight number.

- Boarding gate.

- Departure time.

- Flight delay.

- Boarding instructions.

Trò chơi phát sinh các thử thách tăng dần về độ khó.

Ví dụ:

**Challenge 1:** Xác định số hiệu chuyến bay.

**Challenge 2:** Xác định cổng lên máy bay.

**Challenge 3:** Nhận biết sự thay đổi giờ khởi hành.

**Challenge 4:** Lựa chọn hành động phù hợp dựa trên thông báo.

Hoàn thành nhiệm vụ, sinh viên được nhận:

- Điểm đọc hiểu nội dung nghe.

- Điểm thưởng trò chơi.

- Huy hiệu.

- Nhận xét AI.

Các tệp âm thanh và nội dung câu hỏi phải được chuẩn bị đồng bộ để đáp án luôn chính xác.

**Nhiệm vụ S02: Discussing Solutions to a Problem**

Sinh viên được giao tình huống:

Một trường đại học có số lượng sinh viên tham gia các lớp học tiếng Anh trực tiếp thấp. Nhà trường muốn lựa chọn giải pháp nhằm tăng mức độ tham gia học tập.

Sinh viên có thời gian chuẩn bị, lựa chọn phương án và trình bày giải pháp bằng tiếng Anh.

Game thực hiện:

1.  Hiển thị tình huống.

2.  Cung cấp các phương án.

3.  Cho sinh viên chuẩn bị.

4.  Yêu cầu ghi âm phần trình bày.

5.  Đưa ra câu hỏi mở rộng nếu nhiệm vụ quy định.

6.  AI đánh giá sơ bộ.

7.  Cung cấp nhận xét và khuyến nghị.

Sinh viên có thể xem lại bài nói và thực hiện lại nhiệm vụ trong Quest Mode.

**VI. CƠ CHẾ TÍNH ĐIỂM VÀ PHẦN THƯỞNG**

**1. Hai hệ thống điểm độc lập**

Phải thiết kế hai hệ thống điểm riêng biệt.

**Learning Assessment Score**

Phản ánh kết quả học tập dựa trên đáp án và rubric.

Điểm này sử dụng cho báo cáo học tập và được đồng bộ với AI English Learning Portfolio.

**Game Experience Points (XP)**

Phản ánh hoạt động tham gia trò chơi.

XP có thể được trao khi:

- Hoàn thành nhiệm vụ.

- Duy trì hoạt động luyện tập.

- Hoàn thành nhiệm vụ mới.

- Chinh phục thử thách.

- Đạt được thành tích đặc biệt.

Không dùng điểm XP thay cho điểm đánh giá năng lực tiếng Anh.

**2. Điểm đánh giá bốn kỹ năng**

Đề xuất Dashboard sử dụng thang 100 điểm cho từng kỹ năng.

Điểm tổng hợp tham khảo có thể lấy trung bình bốn kỹ năng khi đã có đầy đủ kết quả hợp lệ.

Đối với bài thi thử, sử dụng quy tắc quy đổi và thang điểm do nhà trường phê duyệt.

Không sử dụng hệ thống quy đổi tự xây dựng để tuyên bố sinh viên đã đạt chứng chỉ VSTEP.

**3. Hệ thống huy hiệu**

Các huy hiệu mẫu:

- Listening Explorer.

- Reading Master.

- Writing Challenger.

- Speaking Champion.

- Four-Skill Explorer.

- Daily Learning Hero.

Huy hiệu thể hiện thành tích và tiến độ trong game, không phải chứng nhận trình độ chính thức.

**VII. HỆ THỐNG AI**

Thiết kế theo kiến trúc dịch vụ độc lập, có thể nâng cấp hoặc thay thế mô hình AI.

Ưu tiên Gemini qua Vertex AI.

**1. AI Question Generator**

Hỗ trợ giảng viên xây dựng:

- Câu hỏi nghe.

- Câu hỏi đọc.

- Chủ đề viết.

- Tình huống nói.

- Câu hỏi mở rộng.

- Nội dung giải thích đáp án.

Mỗi câu hỏi phải có metadata:

- Kỹ năng.

- Cấp độ.

- Chủ đề.

- Mục tiêu đánh giá.

- Độ khó dự kiến.

- Đáp án hoặc rubric.

- Trạng thái phê duyệt.

AI tạo bản nháp. Giảng viên kiểm tra và phê duyệt trước khi đưa vào ngân hàng đề chính thức.

Không cho phép tự động đưa câu hỏi AI chưa được kiểm duyệt vào Mock Exam Mode.

**2. AI Listening & Reading Explainer**

Hỗ trợ giải thích đáp án cho từng câu hỏi.

Các chức năng:

- Giải thích đáp án đúng.

- Phân tích các lựa chọn sai.

- Trích dẫn thông tin liên quan từ tài liệu hoặc bản ghi nội dung nghe.

- Gợi ý từ vựng và cấu trúc ngữ pháp cần học.

Chỉ bật chức năng này sau khi người học hoàn thành câu trả lời trong Quest Mode.

**3. AI Writing Grader**

Chấm sơ bộ bài viết dựa trên rubric của nhiệm vụ.

Các nhóm tiêu chí:

- Task Fulfillment.

- Organization and Coherence.

- Vocabulary.

- Grammar.

Kết quả bao gồm:

- Điểm sơ bộ.

- Điểm thành phần.

- Nhận xét.

- Ví dụ lỗi trong bài.

- Khuyến nghị cải thiện.

Cho phép giảng viên thẩm định và điều chỉnh.

Phải lưu bản gốc bài viết, phiên bản rubric, phiên bản prompt và kết quả đánh giá.

**4. AI Speaking Grader**

Quy trình:

1.  Sinh viên ghi âm.

2.  Hệ thống lưu âm thanh.

3.  Speech-to-Text tạo bản phiên âm.

4.  AI phân tích nội dung bài nói.

5.  Hệ thống đưa ra điểm và nhận xét sơ bộ đối với những tiêu chí có đủ dữ liệu.

6.  Giảng viên có thể nghe lại và thẩm định.

Các tiêu chí có thể bao gồm:

- Task Fulfillment.

- Fluency.

- Vocabulary.

- Grammar.

- Pronunciation.

Không đánh giá độ chính xác phát âm chỉ bằng văn bản phiên âm.

Những tiêu chí như phát âm và ngữ điệu phải sử dụng dữ liệu âm thanh cùng công cụ đánh giá phù hợp hoặc được giảng viên trực tiếp thẩm định.

Nếu thiếu dữ liệu, hệ thống phải hiển thị trạng thái chưa đánh giá thay vì tạo điểm không có cơ sở.

**5. AI Learning Coach**

Trợ lý AI hỗ trợ người học trong Quest Mode.

Các chức năng:

- Giải thích lỗi.

- Hướng dẫn phương pháp làm bài.

- Đề xuất từ vựng.

- Đề xuất nhiệm vụ.

- Xây dựng kế hoạch ôn luyện cá nhân.

Không được tiết lộ đáp án của bài kiểm tra đang diễn ra.

**6. AI Learning Analytics**

Phân tích:

- Kết quả bốn kỹ năng.

- Số lần luyện tập.

- Mức độ tiến bộ.

- Những dạng bài thường xuyên làm sai.

- Những chủ đề cần cải thiện.

Chuẩn hóa dữ liệu để chuyển sang AI English Learning Portfolio và các module AI Dashboard, AI Early Warning của LMS-AI9.

**7. Kiểm soát AI**

Bắt buộc:

- Prompt riêng cho từng chức năng.

- Kiểm tra schema đầu ra.

- Giới hạn token.

- Giới hạn lượt gọi.

- Theo dõi chi phí.

- Xử lý lỗi.

- Chống Prompt Injection.

- Không cung cấp đáp án và rubric bí mật cho người học trong chế độ thi.

- Không cho phép AI trực tiếp sửa điểm đã thẩm định.

**VIII. THIẾT KẾ GIAO DIỆN**

**1. Student Dashboard**

Hiển thị:

- Nhân vật.

- Cấp độ.

- XP.

- Nhiệm vụ đang thực hiện.

- Các kỹ năng.

- Tiến độ học tập.

- Phần thưởng.

- Các cuộc thi đang mở.

**2. Quest World Map**

Bản đồ bốn khu vực thử thách.

Hiển thị nhiệm vụ đã hoàn thành, nhiệm vụ đang mở và nhiệm vụ bị khóa.

**3. Challenge Screen**

Giao diện thực hiện nhiệm vụ, tự động thay đổi theo kỹ năng.

Listening: Trình phát âm thanh và câu hỏi.

Reading: Văn bản và câu hỏi.

Writing: Trình soạn thảo văn bản.

Speaking: Microphone, bộ ghi âm và các yêu cầu của nhiệm vụ.

**4. Results Screen**

Hiển thị:

- Kết quả.

- Đáp án và giải thích khi được phép.

- Điểm thưởng.

- Huy hiệu.

- Nhận xét AI.

- Nhiệm vụ đề xuất.

**5. Championship Dashboard**

Hiển thị các giải đấu mà sinh viên được tham gia.

Bao gồm:

- Tên giải đấu.

- Thời hạn.

- Danh sách thử thách.

- Điểm XP.

- Bảng xếp hạng.

- Thành tích cá nhân.

**6. Teacher Dashboard**

Các chức năng:

- Quản lý lớp.

- Tạo bài luyện tập.

- Tạo bài thi thử.

- Tạo giải đấu.

- Phân công nhiệm vụ.

- Theo dõi tiến độ.

- Xem điểm.

- Thẩm định bài nói và viết.

- Xuất báo cáo.

**7. Administrator Dashboard**

Các chức năng:

- Quản lý trường.

- Quản lý người dùng.

- Quản lý ngân hàng câu hỏi.

- Quản lý cấu hình AI.

- Quản lý quyền.

- Quản lý chi phí.

- Phân tích dữ liệu hệ thống.

Giao diện cần hỗ trợ Responsive Web, sử dụng thuận tiện trên máy tính, máy tính bảng và điện thoại.

Các thao tác và trạng thái quan trọng phải có phương án hỗ trợ bàn phím, trình đọc màn hình và thông báo lỗi rõ ràng.

**IX. KIẾN TRÚC CÔNG NGHỆ**

**1. Nguyên tắc kiến trúc**

VSTEP Quest là ứng dụng độc lập, đồng thời có khả năng kết nối với hệ sinh thái LMS-AI9.

Thiết kế theo kiến trúc nhiều trường đại học, có thể mở rộng quy mô mà không phải xây dựng lại toàn bộ ứng dụng.

Sử dụng API để trao đổi dữ liệu với các phần mềm khác.

Không truy cập trực tiếp hoặc phụ thuộc vào cấu trúc Firestore nội bộ của English City Simulator và English Detective.

**2. Công nghệ**

**Frontend**

- React.

- TypeScript.

- Vite.

- Tailwind CSS.

- Firebase Hosting.

**Backend**

- Node.js.

- TypeScript.

- REST API.

- Google Cloud Run.

- Firebase Admin SDK.

**Database**

- Cloud Firestore.

**Storage**

- Google Cloud Storage.

**Authentication**

- Firebase Authentication.

**AI**

- Vertex AI/Gemini.

- Google Cloud Speech-to-Text.

- Google Cloud Text-to-Speech khi cần tạo học liệu âm thanh.

**Xử lý bất đồng bộ**

- Cloud Tasks hoặc cơ chế hàng đợi tương đương phù hợp cho những công việc AI kéo dài.

**3. Cấu trúc Firestore**

Thiết kế theo mô hình multi-tenant.

Các nhóm dữ liệu chính:

**tenants**

- Thông tin trường.

- Cấu hình.

- Hạn mức.

**users**

- Hồ sơ người dùng.

- Vai trò.

- Trường và lớp.

**courses**

- Học phần.

- Danh sách giảng viên và sinh viên.

- Các nhiệm vụ được phân công.

**question_bank**

- Câu hỏi.

- Kỹ năng.

- Cấp độ.

- Nội dung.

- Đáp án.

- Rubric.

- Trạng thái kiểm duyệt.

**quests**

- Thông tin nhiệm vụ.

- Kỹ năng.

- Cấp độ.

- Thời lượng.

- Điều kiện hoàn thành.

**exam_blueprints**

- Cấu trúc bài thi.

- Phân bổ câu hỏi.

- Thời lượng.

- Thang điểm.

- Rubric.

**mock_exams**

- Đề thi được phê duyệt.

- Phiên bản đề.

- Danh sách câu hỏi.

**game_sessions**

- Sinh viên.

- Nhiệm vụ.

- Trạng thái.

- Thời điểm bắt đầu và kết thúc.

**attempts**

- Bài làm.

- Các câu trả lời.

- Thời gian.

- Trạng thái nộp bài.

**speaking_recordings**

- Metadata và đường dẫn âm thanh.

- Trạng thái xử lý.

**writing_submissions**

- Nội dung bài viết.

- Phiên bản bài làm.

- Trạng thái.

**assessments**

- Kết quả tự động.

- Kết quả AI.

- Kết quả thẩm định.

- Rubric và phiên bản chấm.

**championships**

- Giải đấu.

- Lớp và đội tham gia.

- Nhiệm vụ.

- Thời hạn.

- Quy tắc tính điểm.

**achievements**

- XP.

- Huy hiệu.

- Thành tích.

**learning_profiles**

- Kết quả tổng hợp bốn kỹ năng.

- Những kỹ năng cần cải thiện.

- Lịch sử học tập.

**usage_logs**

- Số lượt sử dụng AI.

- Token.

- Thời lượng xử lý âm thanh.

- Chi phí ước tính.

Các dữ liệu thuộc một trường phải được đặt trong phạm vi tenant thích hợp.

Đáp án, rubric bí mật và cấu hình đề thi được bảo vệ tại backend, không cho phép sinh viên tải toàn bộ dữ liệu từ Firestore.

**X. THIẾT KẾ API**

| **API**                               | **Chức năng**            |
|---------------------------------------|--------------------------|
| GET /api/me                           | Lấy thông tin người dùng |
| GET /api/world                        | Bản đồ trò chơi          |
| GET /api/quests                       | Danh sách nhiệm vụ       |
| POST /api/sessions                    | Bắt đầu phiên chơi       |
| GET /api/sessions/:id                   | Trạng thái phiên         |
| POST /api/sessions/:id/answers           | Gửi câu trả lời          |
| POST /api/sessions/:id/audio             | Gửi bài nói              |
| PUT /api/sessions/:id/writing            | Lưu bài viết             |
| POST /api/sessions/:id/submit            | Nộp bài                  |
| GET /api/sessions/:id/results            | Xem kết quả              |
| GET /api/student/progress             | Tiến độ học tập          |
| GET /api/championships                | Danh sách giải đấu       |
| GET /api/championships/:id/leaderboard   | Bảng xếp hạng            |
| GET /api/teacher/classes              | Quản lý lớp              |
| POST /api/teacher/assessments/:id/review | Thẩm định bài làm        |
| GET /api/admin/usage                  | Theo dõi sử dụng         |

Bổ sung những API quản trị cho ngân hàng đề, nhiệm vụ, bài thi thử và giải đấu.

Yêu cầu chung:

- Xác thực và phân quyền.

- Kiểm tra quyền truy cập theo trường.

- Kiểm tra dữ liệu đầu vào.

- Giới hạn tần suất gọi API.

- Chống gửi trùng bài làm.

- Ghi nhật ký lỗi.

Bài thi phải có trạng thái do server quản lý. Hết thời gian hoặc đã nộp bài thì không được phép sửa câu trả lời.

Thời gian hệ thống phải được xác định từ server, không dựa hoàn toàn vào đồng hồ hoặc dữ liệu gửi từ trình duyệt.

**XI. TÍCH HỢP VỚI LMS-AI9**

Thiết kế khả năng kết nối với LMS-AI9 và Moodle 4.5/5.0.

Hỗ trợ:

- Đăng nhập một lần.

- Đồng bộ người dùng.

- Đồng bộ lớp.

- Phân công nhiệm vụ.

- Truyền kết quả.

- Truyền dữ liệu học tập.

- Kết nối AI English Learning Portfolio.

Phiên bản đầu tiên sử dụng Firebase Authentication và hỗ trợ xuất CSV.

Thiết kế API chuẩn bị cho tích hợp LTI 1.3 hoặc SSO/API tập trung của LMS-AI9 ở giai đoạn tiếp theo.

Kết quả học tập được chuẩn hóa thành cùng một cấu trúc dữ liệu với hai game còn lại.

Phân biệt rõ:

- Điểm thưởng trò chơi.

- Điểm luyện tập.

- Điểm bài thi thử.

- Điểm đã được giảng viên thẩm định.

Không mặc định tự động chuyển điểm AI thành điểm học phần chính thức.

**XII. BẢO MẬT VÀ QUẢN LÝ CHI PHÍ**

**1. Bảo mật**

- Firebase Authentication.

- Phân quyền theo vai trò.

- Phân tách dữ liệu giữa các trường.

- Kiểm tra quyền tại backend.

- Firebase Security Rules.

- Secret Manager.

- Giới hạn quyền của tài khoản dịch vụ.

- Nhật ký quản trị.

- Bảo vệ đáp án và dữ liệu đề thi.

- Quy định quyền truy cập bản ghi âm và bài viết.

Sử dụng Firebase Emulator để kiểm thử bảo mật dữ liệu.

Không đưa API Key bí mật hoặc tài khoản dịch vụ lên GitHub.

**2. Bảo vệ dữ liệu người học**

- Thông báo về việc ghi âm và xử lý dữ liệu học tập.

- Chỉ thu thập dữ liệu cần thiết.

- Quy định thời hạn lưu trữ.

- Cho phép xử lý yêu cầu xóa dữ liệu theo chính sách nhà trường.

- Không sử dụng dữ liệu người học để huấn luyện mô hình khi chưa có cơ sở phù hợp.

- Hạn chế quyền xem và tải xuống bản ghi âm.

**3. Quản lý chi phí AI**

Cho phép quản trị viên cấu hình:

- Số nhiệm vụ tối đa.

- Số lần làm lại.

- Số lần AI chấm bài.

- Giới hạn token.

- Giới hạn thời lượng ghi âm.

- Ngân sách theo trường và lớp.

- Cảnh báo khi gần đạt hạn mức.

Ưu tiên tạo sẵn và lưu trữ âm thanh của các bài Listening nhằm giảm chi phí phát sinh khi nhiều sinh viên cùng luyện tập.

Lưu nhật ký sử dụng và ước tính chi phí theo từng dịch vụ.

Thiết lập cảnh báo ngân sách Google Cloud và cơ chế giới hạn yêu cầu AI tại backend.

**XIII. KẾ HOẠCH XÂY DỰNG BẰNG CLAUDE CODE**

**Giai đoạn 1: Nền tảng**

- Khởi tạo monorepo.

- Thiết lập React, TypeScript.

- Xây dựng backend.

- Thiết lập Firebase.

- Thiết kế Firestore.

- Xác thực và phân quyền.

- Giao diện Dashboard.

**Giai đoạn 2: Game Engine**

- Bản đồ.

- Avatar.

- Hệ thống nhiệm vụ.

- Hệ thống XP và huy hiệu.

- Quản lý trạng thái.

- Lưu kết quả và tiến độ.

**Giai đoạn 3: Bốn trạm thử thách**

Phát triển đầy đủ:

- Listening.

- Reading.

- Writing.

- Speaking.

Hoàn thiện tám nhiệm vụ mẫu.

**Giai đoạn 4: Hệ thống AI**

- AI Question Generator.

- AI Listening & Reading Explainer.

- AI Writing Grader.

- AI Speaking Grader.

- AI Learning Coach.

- AI Learning Analytics.

**Giai đoạn 5: Thi thử và giải đấu**

- Mock Exam Mode.

- Championship Mode.

- Tính điểm.

- Bảng xếp hạng.

- Báo cáo.

**Giai đoạn 6: Dashboard và tích hợp**

- Student Dashboard.

- Teacher Dashboard.

- Administrator Dashboard.

- Quản lý chi phí AI.

- API kết nối LMS-AI9.

**Giai đoạn 7: Kiểm thử**

Thực hiện:

- Unit Test.

- Integration Test.

- End-to-End Test.

- Firebase Emulator Test.

- Kiểm thử AI.

- Kiểm thử phân quyền.

- Kiểm thử chống lộ đáp án.

- Kiểm thử giới hạn thời gian.

- Kiểm thử lưu bài khi mất kết nối.

- Kiểm thử chống gửi trùng.

- Kiểm thử chi phí và hạn mức.

**XIV. GITHUB VÀ TRIỂN KHAI GOOGLE CLOUD**

**1. Repository**

Tên repository:

**vstep-quest**

Cấu trúc đề xuất:

- apps/web

- apps/api

- packages/shared

- packages/game-engine

- packages/ai

- firebase

- infrastructure

- scripts

- tests

- docs

- .github/workflows

Tạo đầy đủ:

- README.md.

- ARCHITECTURE.md.

- DATABASE.md.

- API.md.

- DEPLOYMENT.md.

- TESTING.md.

- SECURITY.md.

- .env.example.

- .gitignore.

**2. Quy trình phát triển**

Claude Code thực hiện:

1.  Xây dựng kế hoạch.

2.  Khởi tạo dự án.

3.  Phát triển từng module.

4.  Chạy kiểm thử.

5.  Tạo commit.

6.  Đẩy mã nguồn lên GitHub sau khi được cấp quyền.

7.  Chuẩn bị cấu hình và tài liệu triển khai.

Không chỉ tạo giao diện minh họa hoặc sử dụng dữ liệu giả cho những chức năng bắt buộc.

**3. Triển khai bằng Claude Cowork**

Chuẩn bị hệ thống để Claude Cowork có thể triển khai theo quy trình đã được chủ sở hữu phê duyệt.

Kiến trúc:

- Firebase Hosting: Frontend.

- Cloud Run: Backend.

- Firestore: Database.

- Cloud Storage: Audio.

- Vertex AI: Gemini.

- Google Cloud Speech-to-Text.

- Firebase Authentication.

- Secret Manager.

- GitHub Actions.

Có hai môi trường:

- Staging.

- Production.

Ưu tiên sử dụng Workload Identity Federation cho GitHub Actions.

Không đưa khóa dịch vụ dài hạn vào GitHub.

Các thông số dự án Google Cloud, tài khoản và quyền triển khai phải được chủ sở hữu cung cấp và phê duyệt trước khi thực hiện.

**4. Yêu cầu bàn giao**

Claude Code phải bàn giao:

- Mã nguồn hoàn chỉnh.

- Tài liệu kỹ thuật.

- Dữ liệu mẫu.

- Bộ kiểm thử tự động.

- Hướng dẫn phát triển.

- Hướng dẫn cài đặt.

- Hướng dẫn triển khai.

- Tài liệu vận hành.

- API tích hợp.

- Tài liệu quản lý chi phí.

**XV. TIÊU CHÍ NGHIỆM THU PHIÊN BẢN 1.0**

Phiên bản 1.0 chỉ được coi là hoàn thành khi đạt các yêu cầu:

1.  Sinh viên có thể đăng nhập, chọn nhân vật và truy cập thế giới trò chơi.

2.  Bốn khu vực thử thách hoạt động đầy đủ.

3.  Tám nhiệm vụ mẫu hoàn chỉnh và có thể thực hiện.

4.  Chấm tự động Nghe và Đọc chính xác theo đáp án được phê duyệt.

5.  Sinh viên có thể soạn thảo, lưu và nộp bài Viết.

6.  Sinh viên có thể ghi âm và nộp bài Nói.

7.  AI hỗ trợ đánh giá sơ bộ bài Nói và Viết theo rubric.

8.  Giảng viên có thể thẩm định kết quả.

9.  Hoàn thành ít nhất một bài thi thử tích hợp bốn kỹ năng.

10. Có chế độ giải đấu bất đồng bộ với bảng xếp hạng.

11. Có XP, huy hiệu và hệ thống mở khóa nhiệm vụ.

12. Có Dashboard cho sinh viên, giảng viên và quản trị viên.

13. Có các API chuẩn bị cho tích hợp LMS-AI9.

14. Có cơ chế phân tách dữ liệu giữa các trường.

15. Có cơ chế quản lý và giới hạn chi phí AI.

16. Hoàn thành những bài kiểm thử chức năng và bảo mật quan trọng.

17. Ứng dụng có thể triển khai trên Google Cloud/Firebase.

18. Mã nguồn và tài liệu được bàn giao đầy đủ trên GitHub.

**Yêu cầu cuối cùng:** Xây dựng VSTEP Quest thành ứng dụng học tập thực tế, có thể triển khai cho nhiều trường đại học, sử dụng dữ liệu thật, có khả năng mở rộng và kết nối với các ứng dụng thuộc hệ sinh thái LMS-AI9.

**Kiến trúc tích hợp ba game**

Để tránh phải xây dựng lại hệ thống quản lý người dùng, chi phí AI và hồ sơ học tập trong từng game, nên tổ chức kiến trúc tích hợp như sau:

LMS-AI9

Quản lý học phần, sinh viên, giảng viên và phân công nhiệm vụ

Central API Platform

SSO · API Gateway · AI Management

Game 1

English City

Nghe – Nói

Game 2

English Detective

Đọc – Viết

Game 3

VSTEP Quest

4 kỹ năng

AI English Learning Portfolio

Hồ sơ năng lực và lộ trình ôn luyện cá nhân hóa

Listening

Speaking

Reading

Writing

Ba game nên được phát triển bằng ba repository độc lập và sử dụng một chuẩn API kết quả học tập thống nhất. Firestore của từng ứng dụng có thể được triển khai độc lập, trong khi Central API Platform đảm nhiệm việc đồng bộ dữ liệu được phép chia sẻ.

Điều này giúp từng trường có thể lựa chọn triển khai một game, nhiều game hoặc toàn bộ hệ sinh thái mà không bắt buộc phải cài đặt tất cả các phần mềm.
