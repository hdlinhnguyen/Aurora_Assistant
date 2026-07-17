# Thiet ke module lo trinh hoc tap ca nhan hoa

## 1. Muc tieu

Module tao lo trinh hoc tap ca nhan hoa cho hoc sinh dang hoc trong lop do giao vien quan ly. He thong khong chi danh dau dung/sai tai topic hien tai ma phai truy nguoc Knowledge Graph de tim khoang trong kien thuc goc, ke ca topic thuoc khoi lop thap hon, sau do tao chuoi topic can hoc voi muc tieu thanh thao va dieu kien chuyen tiep ro rang.

Giao vien la nguoi dat muc tieu, rang buoc va phe duyet chinh sach hoc tap. He thong phu trach tong hop evidence, uoc luong nang luc, chan doan gap, de xuat lo trinh, gom nhom hoc sinh va uu tien ho tro o cap lop.

## 2. Pham vi

### 2.1. Trong pham vi

- Tiep nhan mastery evidence tu bai thi giay da OCR/cham theo rubric va quiz tren he thong.
- Chuan hoa va hieu chinh do tin cay cua evidence.
- Uoc luong mastery theo tung cap `student-topic` bang Bayesian Knowledge Tracing (BKT).
- Tinh `confidence_score` rieng voi `mastery_probability`.
- Truy nguoc prerequisite graph de tim root-cause gap.
- Yeu cau quiz chan doan khi evidence chua du chac chan.
- Tao lo trinh gom topic, mastery hien tai, mastery muc tieu va dieu kien hoan thanh.
- Toi uu lo trinh theo deadline, thoi luong va rang buoc cua giao vien.
- Tu dong gom nhom hoc sinh theo nhu cau.
- Phat hien gap chung cua lop va de xuat hoc sinh can ho tro truoc.
- Luu version, lich su thay doi va ly do cua moi de xuat.

### 2.2. Ngoai pham vi

- OCR bai lam viet tay.
- Mapping bai lam voi rubric.
- Cham diem cau hoi hoac quiz.
- Quan ly ngan hang cau hoi.
- Gan topic cho cau hoi va rubric.
- Tu dong sua Knowledge Graph.
- Bat giao vien dieu chinh truc tiep cac tham so BKT.

## 3. Cac he thong lien quan

### 3.1. Knowledge Graph

Knowledge Graph da ton tai va luu topic cung quan he prerequisite dang co huong:

```text
prerequisite_topic -> dependent_topic
```

Vi du:

```text
Phep cong -> Phep nhan
Quy dong mau so -> Cong phan so -> Bieu thuc so huu ti
```

Graph hien chi co canh phu thuoc, chua co trong so, loai phu thuoc hoac nguong mastery tren canh. Module phai hoat dong duoc voi du lieu nay; trong so canh duoc tinh dong neu can.

### 3.2. Nguon evidence tu bai thi giay

Luong hien co:

```text
Approved Assessment Template
-> OCR bai lam
-> Answer-Rubric Mapping
-> Teacher Final Review
-> Approved Rubric Evaluation
-> Paper Mastery Evidence
```

Evidence co the chua:

- Student ID.
- Assessment, question va rubric item ID.
- Topic tu question tag va rubric tag.
- Diem dat duoc va diem toi da.
- Trang thai dat, dat mot phan, chua dat, khong lam hoac khong doc duoc.
- Xac nhan cua giao vien.
- Timestamp.

Chi evidence da duoc giao vien xac nhan moi cap nhat mastery chinh thuc. Evidence chua xac nhan duoc luu o trang thai `provisional`.

### 3.3. Nguon evidence tu quiz tren he thong

Luong hien co:

```text
Question Bank
-> Quiz Session
-> Answer Evaluation
-> Quiz Mastery Evidence
```

Evidence co the chua:

- Student ID, quiz session ID va question ID.
- Topic ID.
- Ket qua va diem dat duoc.
- Do kho.
- Thoi gian tra loi.
- So lan thu.
- Goi y da su dung.
- Phuong phap cham.
- Timestamp.

## 4. Kien truc logic

He thong duoc chia thanh cac thanh phan sau.

### 4.1. Evidence Ingestion and Calibration

Tiep nhan hai nguon evidence, kiem tra schema, chong trung lap va chuyen ve cung mot hop dong du lieu. Thanh phan nay khong cham lai bai lam.

Nhiem vu:

- Xac thuc `student_id`, `topic_id` va lineage cua evidence.
- Bao dam xu ly idempotent theo `evidence_id`.
- Tranh double-count question tag va rubric tag cua cung mot ket qua.
- Tinh `observation_value` va `evidence_weight`.
- Luu nguon goc de co the giai thich va tinh lai.

### 4.2. Core Mastery Module

Dung weighted BKT de cap nhat `mastery_probability` theo tung cap `student-topic`. Day la noi duy nhat so huu trang thai mastery chinh thuc.

### 4.3. Gap Diagnosis Engine

Nhan topic muc tieu, truy nguoc Knowledge Graph, phan loai cac prerequisite thanh `mastered`, `learning`, `uncertain` hoac `confirmed_gap`, sau do xep hang gap co kha nang la nguyen nhan goc.

### 4.4. Diagnostic Assessment Planner

Chon cac cau hoi ngan cho topic `uncertain`. Muc tieu la thu them evidence co gia tri phan biet cao, khong bat hoc sinh lam lai toan bo bai kiem tra.

### 4.5. Root-Cause Ranker

Tinh muc do nghiem trong va anh huong cua gap, loai bo nhung loi chi la he qua cua gap phia truoc, va tra ve root-cause gap kem giai thich.

### 4.6. Personalized Path Planner

Tao remediation subgraph, loai topic da thanh thao, toi uu danh sach topic theo rang buoc cua giao vien va sap thu tu bang topological sort.

### 4.7. Teacher Control and Class Insight

Cho phep giao vien dat rang buoc, phe duyet hoac override lo trinh. Thanh phan nay cung tong hop gap toan lop, tao nhom can thiep va xep hang hoc sinh can ho tro.

## 5. Chuan hoa evidence

Hop dong evidence noi bo:

```text
CalibratedMasteryEvidence
- evidence_id
- student_id
- topic_id
- source
- observation_value
- evidence_weight
- occurred_at
- assessment_attempt_id
- question_id
- rubric_item_id
- teacher_confirmed
- lineage
- status
```

`observation_value` nam trong khoang `0..1`. Voi rubric, gia tri co the tinh tu ti le diem cua tung rubric item. Voi quiz, gia tri duoc tao tu ket qua dung/sai hoac diem mot phan.

Trong so evidence:

```text
evidence_weight =
    source_reliability
  * evaluation_reliability
  * difficulty_informativeness
  * hint_factor
  * attempt_factor
  * recency_factor
```

Gia tri khoi tao minh hoa:

```text
Bai giay da giao vien xac nhan: 1.00
Quiz cham tu dong:              0.85
Da dung goi y:                  x 0.70
Lan thu thu hai:                x 0.80
```

Day la tham so cau hinh ban dau, khong phai gia tri nghiep vu co dinh. Chung phai duoc hieu chinh bang du lieu thuc te.

## 6. Bayesian Knowledge Tracing

BKT uoc luong:

```text
P(L_t) = xac suat hoc sinh da thanh thao topic tai thoi diem t
```

Moi topic co cac tham so:

- `P(L0)`: xac suat da biet truoc khi co evidence.
- `P(T)`: xac suat hoc duoc sau mot co hoi luyen tap.
- `P(S)`: xac suat lam sai du da biet.
- `P(G)`: xac suat lam dung du chua biet.

Phien ban dau co the dung tham so mac dinh theo mon, khoi va loai cau hoi. Khi co du du lieu, tham so duoc hieu chinh tu lich su toan he thong.

Vi evidence co diem mot phan va trong so, he thong dung weighted/soft-evidence BKT thay vi ep moi quan sat thanh dung hoac sai tuyet doi. Viec nay can duoc kiem dinh de bao dam mastery khong tang qua nhanh sau mot evidence yeu.

## 7. Confidence score

`mastery_probability` tra loi hoc sinh co kha nang da thanh thao den dau. `confidence_score` tra loi he thong tin tuong den dau vao uoc luong do.

Khong dat ten la `confidence_probability`, vi day la chi so tong hop chuan hoa, khong phai xac suat Bayesian thuan tuy.

### 7.1. Luong evidence hieu dung

```text
effective_evidence = sum(evidence_weight_i)

evidence_sufficiency = 1 - exp(-effective_evidence / k)
```

`k` la so evidence hieu dung can de dat do tin cay tuong doi cao, vi du gia tri khoi tao `k = 5`.

### 7.2. Do chac chan cua posterior

```text
H(p) = -p*log(p) - (1-p)*log(1-p)

posterior_certainty = 1 - H(P_mastery) / log(2)
```

Mastery gan `0.5` tao certainty thap; mastery gan `0` hoac `1` tao certainty cao.

### 7.3. Tinh nhat quan

```text
consistency = 1 - weighted_prediction_error
```

Sai so duoc tinh tren cac observation gan day va phai ton trong thu tu thoi gian de khong phat hoc sinh chi vi cac em dang tien bo.

### 7.4. Cong thuc tong hop

```text
confidence_score =
    evidence_sufficiency
  * (0.7 * posterior_certainty + 0.3 * consistency)
```

Vi `evidence_sufficiency` la cong, mot cau tra loi dung khong the tao confidence cao ngay ca khi BKT tam thoi tra mastery cao.

Nguong khoi tao:

```text
mastery >= 0.80 va confidence >= 0.70 -> mastered
mastery <  0.60 va confidence >= 0.70 -> confirmed_gap
confidence < 0.70                     -> uncertain
con lai                                -> learning
```

Nguong phai cau hinh duoc theo mon va khoi.

## 8. Hop dong du lieu voi Path Planner

### 8.1. Student Topic Knowledge State

```text
StudentTopicKnowledgeState
- student_id
- topic_id
- mastery_probability
- confidence_score
- evidence_count
- effective_evidence
- last_evidence_at
- mastery_status
- evidence_summary
- source_breakdown
- version
```

### 8.2. Yeu cau cua giao vien

```text
LearningPathRequest
- class_id
- student_ids[]
- target_topic_ids[]
- deadline
- estimated_minutes_per_student
- required_topic_ids[]
- excluded_topic_ids[]
- target_mastery_threshold
- minimum_confidence_threshold
- review_checkpoint
- teacher_id
```

### 8.3. Du lieu Knowledge Graph

```text
Topic
- topic_id
- subject_id
- grade_level
- name
- estimated_learning_time

PrerequisiteEdge
- prerequisite_topic_id
- dependent_topic_id
```

## 9. Thuat toan chan doan root-cause gap

### 9.1. Tao relevant subgraph

Tu topic muc tieu, chay reverse BFS/DFS de lay tat ca prerequisite xuyen khoi lop:

```text
RelevantSubgraph = ancestors(target_topics) + target_topics
```

Graph con phai la DAG. Neu co cycle, Path Planner khong duoc tao lo trinh moi tren vung graph loi.

### 9.2. Phan loai topic

Moi topic trong relevant subgraph duoc gan trang thai theo mastery va confidence. Topic `unknown` hoac `uncertain` khong bi mac dinh la gap.

### 9.3. Xep hang gap

```text
gap_score =
    mastery_deficit
  * diagnostic_confidence
  * target_relevance
  * downstream_impact
  * recency_factor
```

Trong do:

```text
mastery_deficit   = 1 - mastery_probability
target_relevance  = 1 / (1 + distance_to_target)
downstream_impact = so topic chua vung phu thuoc vao topic nay
```

### 9.4. Xac dinh root cause

Mot root-cause candidate phai:

- Chua thanh thao voi confidence du cao.
- Nam tren duong prerequisite toi topic muc tieu.
- La diem dut som nhat co bang chung trong mot nhanh prerequisite.
- Co kha nang mo khoa mot hoac nhieu topic phia sau khi duoc cai thien.

Neu gap co confidence thap, he thong phai yeu cau chan doan them thay vi ket luan.

## 10. Thuat toan tao lo trinh

### 10.1. Remediation subgraph

Bao gom:

- Root-cause gaps.
- Topic trung gian chua thanh thao.
- Topic muc tieu.
- Topic bat buoc do giao vien dat.

Topic da mastered duoc giu trong dependency graph de giai thich, nhung khong tro thanh buoc hoc.

### 10.2. Toi uu theo ngan sach

```text
learning_cost = estimated_minutes

learning_value =
    expected_mastery_gain
  * target_relevance
  * downstream_impact
```

Neu du thoi gian, he thong lay toan bo remediation subgraph. Neu thieu thoi gian, dung constrained knapsack heuristic de chon tap topic co gia tri cao, nhung van bao toan prerequisite bat buoc.

Khong dung shortest path don thuan vi mot topic co the can nhieu prerequisite dong thoi. Khi quy mo va nhu cau toi uu tang, co the thay heuristic bang Integer Linear Programming.

### 10.3. Sap thu tu

Dung topological sort. Neu nhieu topic cung san sang:

1. Gap score cao hon.
2. Mo khoa nhieu topic hon.
3. Chi phi hoc thap hon.
4. Gan deadline hon.

### 10.4. Dieu kien hoan thanh

```text
mastery_probability >= target_mastery
AND confidence_score >= minimum_confidence
```

Xem bai hoac lam du so cau khong tu dong dong nghia voi thanh thao.

## 11. Dau ra Personalized Learning Path

```text
PersonalizedLearningPath
- path_id
- student_id
- class_id
- target_topic_ids[]
- teacher_constraints
- diagnosis_summary
- ordered_steps[]
- total_estimated_minutes
- generated_at
- next_review_checkpoint
- status
- version
```

Moi buoc:

```text
PathStep
- topic_id
- order
- current_mastery
- current_confidence
- target_mastery
- minimum_confidence
- gap_score
- estimated_minutes
- inclusion_reason
- completion_condition
- status
- teacher_locked
```

Trang thai lo trinh:

```text
Draft -> Approved -> Active -> Paused -> Completed
                         |
                         -> Superseded
```

## 12. Quyen kiem soat cua giao vien

### 12.1. Cap lop

Giao vien duoc dat:

- Topic dang day va topic muc tieu.
- Deadline va thoi luong luyen tap.
- Nguong mastery muc tieu.
- Topic bat buoc hoac bi loai.
- Thoi diem tai danh gia.

### 12.2. Cap lo trinh

Giao vien co the:

- Phe duyet hang loat.
- Them, xoa hoac doi thu tu topic.
- Khoa mot buoc.
- Tao lai hoac tam dung lo trinh.
- Giao cung hoat dong cho mot nhom.
- Chap nhan hoac tu choi thay doi do he thong de xuat.

Moi override luu `teacher_id`, timestamp, pham vi va ly do. Override khong duoc am tham bi he thong dao nguoc.

### 12.3. Tham so mo hinh

Giao vien dieu chinh chinh sach hoc tap, khong dieu chinh truc tiep `slip`, `guess`, `transition` hoac tham so noi bo khac cua BKT.

## 13. Gom nhom va uu tien o cap lop

### 13.1. Gom nhom

Nhom theo root-cause gap va hinh thuc can thiep, khong theo tong diem:

```text
group_key =
    root_cause_topic
  + mastery_band
  + target_topic
  + recommended_intervention
```

Vi du:

- Hong quy dong mau so.
- Hong phep tinh voi so am.
- Da vung nen tang va can bai nang cao.
- Chua du evidence va can quiz chan doan.

Mot hoc sinh co the co nhieu nhu cau, nhung chi co mot `primary_intervention_group` tai mot thoi diem. Giao vien co the khoa nhom trong mot buoi hoc.

### 13.2. Gap toan lop

```text
confirmed_gap_rate =
    confirmed_gap_students
    / students_with_sufficient_confidence

class_gap_score =
    confirmed_gap_rate
  * average_gap_severity
  * target_relevance
  * average_confidence
```

Hoc sinh thieu evidence khong nam trong mau so ket luan; cac em duoc bao rieng.

Nguong khoi tao:

```text
>= 40%       -> de xuat day lai ca lop
15% den <40% -> de xuat day nhom nho
< 15%        -> de xuat ho tro ca nhan
```

### 13.3. Hoc sinh can ho tro truoc

```text
help_priority =
    gap_severity
  * diagnostic_confidence
  * curricular_urgency
  * downstream_impact
  * intervention_need
```

`intervention_need` tang khi hoc sinh khong tien bo sau nhieu checkpoint. Hoc sinh confidence thap duoc uu tien chan doan, khong mac dinh uu tien giao vien kem truc tiep.

### 13.4. Dau ra dashboard

```text
ClassLearningInsight
- class_id
- target_topics
- class_mastery_distribution
- class_wide_gaps[]
- suggested_reteach_topics[]
- intervention_groups[]
- prioritized_students[]
- insufficient_evidence_students[]
- path_approval_summary
- changes_since_last_checkpoint
```

Moi de xuat phai kem so lieu va ly do.

## 14. Luong xu ly end-to-end

1. Giao vien chon lop, topic muc tieu va rang buoc.
2. Paper Evidence va Quiz Evidence duoc gui vao Evidence Ingestion.
3. Evidence duoc validate, chong trung lap, hieu chinh va luu lineage.
4. Core Mastery Module cap nhat weighted BKT va confidence.
5. Su kien `StudentTopicMasteryUpdated` duoc phat.
6. Gap Diagnosis Engine truy nguoc Knowledge Graph.
7. Topic uncertain quan trong duoc gui sang Diagnostic Assessment Planner.
8. Root-Cause Ranker xac dinh gap goc co confidence du cao.
9. Path Planner tao remediation subgraph va toi uu theo rang buoc.
10. He thong tao Draft Path va giai thich cho giao vien.
11. Giao vien phe duyet, sua hoac override.
12. Hoc sinh thuc hien tung buoc dang `available`.
13. Ket qua luyen tap tao Quiz Mastery Evidence moi.
14. Tai checkpoint, mastery va lo trinh duoc danh gia lai.
15. He thong tao version moi neu can va cap nhat dashboard lop.

## 15. Quy tac tai lap ke hoach

Nhan su kien mastery khong dong nghia lap tuc thay doi toan bo lo trinh. Path Planner chi tai lap ke hoach khi:

- Ket thuc quiz hoac bai kiem tra.
- Hoc sinh hoan thanh mot path step.
- Gap chuyen tu `uncertain` sang `confirmed_gap`.
- Giao vien thay doi muc tieu hoac rang buoc.
- Den review checkpoint.
- Evidence quan trong bi sua hoac thu hoi.

Moi lan thay doi tao version moi va phai cho biet topic nao duoc them, loai bo, doi thu tu va vi sao.

## 16. Ngoai le va cach xu ly

### 16.1. Khong du evidence

- Gan `uncertain`, khong gan `confirmed_gap`.
- De xuat quiz chan doan.
- Khong tu dong dua vao nhom can giao vien kem.

### 16.2. Evidence mau thuan

- So sanh do moi, do kho, goi y, so lan thu va nguon.
- Giam confidence neu mau thuan keo dai.
- De xuat assessment xac nhan.
- Hien thi source breakdown cho giao vien.

### 16.3. Knowledge Graph co cycle

- Tra `graph_validation_error`.
- Khong tao lo trinh moi tren vung graph loi.
- Giu lo trinh dang active neu co.
- Bao ro cac node va canh tao cycle.

### 16.4. Topic chua co mastery state

- Gan `unknown`, khong mac dinh la gap.
- Lay evidence bang diagnostic assessment neu topic co anh huong cao.

### 16.5. Khong co duong toi topic muc tieu

- Tra `no_valid_prerequisite_path`.
- Cho giao vien giao topic muc tieu truc tiep.
- Tao canh bao kiem tra Knowledge Graph.

### 16.6. Khong du thoi gian

Tra ve:

```text
minimum_required_minutes
available_minutes
blocked_target_topics
recommended_core_steps
deferred_steps
```

Giao vien chon tang thoi luong, giam muc tieu hoac chap nhan phuong an rut gon.

### 16.7. Khong co noi dung luyen tap

- Giu topic trong lo trinh.
- Gan `content_unavailable`.
- Cho phep giao vien giao hoat dong ngoai he thong.
- Khong coi thieu content la da hoan thanh.

### 16.8. Evidence bi sua hoac thu hoi

- Evidence cu duoc danh dau `superseded`.
- Mastery duoc tinh lai tu event history.
- Lo trinh lien quan duoc danh dau `stale`.
- Tao version moi tai checkpoint hoac theo yeu cau giao vien.

### 16.9. Giao vien override prerequisite

- Luu ly do va pham vi.
- Mo buoc phia sau theo override.
- Van theo doi gap bi bo qua.
- Neu hoc sinh tiep tuc that bai, canh bao giao vien thay vi tu them lai topic.

### 16.10. Cap nhat dong thoi

Dung `version` va optimistic concurrency cho knowledge state va learning path. Khi xung dot, tao lai de xuat tu trang thai moi nhat va khong ghi de quyet dinh cua giao vien.

## 17. Kiem thu

### 17.1. Core Mastery

- BKT cap nhat dung sau evidence dung, sai va mot phan.
- Evidence weight anh huong dung muc.
- Mot `evidence_id` khong duoc xu ly hai lan.
- Evidence bi superseded tao lai state dung.
- Confidence thap khi evidence it, cu hoac mau thuan.

### 17.2. Graph va chan doan

- Reverse traversal lay dung ancestors.
- Phat hien cycle.
- Khong xem `unknown` la gap.
- Tim dung root cause tren mot nhanh va nhieu nhanh prerequisite.
- Tao yeu cau chan doan khi confidence thap.

### 17.3. Path Planning

- Bao toan prerequisite trong remediation subgraph.
- Loai topic da mastered.
- Topological order hop le.
- Ton trong required/excluded/locked topic.
- Tra phuong an rut gon khi thieu ngan sach.
- Version va change explanation duoc tao dung.

### 17.4. Lop hoc

- Confirmed gap rate khong tinh hoc sinh thieu confidence vao mau so.
- Nhom theo root cause, khong theo tong diem.
- Priority thay doi dung theo urgency va intervention need.
- Teacher override khong bi he thong tu dong dao nguoc.

## 18. Chi so danh gia

### 18.1. Chat luong mo hinh

- BKT prediction accuracy va log loss.
- Calibration cua mastery probability.
- Ti le gap duoc giao vien xac nhan.
- Ti le chan doan bo sung lam thay doi ket luan gap.

### 18.2. Hieu qua hoc tap

- Mastery gain sau moi path step.
- Thoi gian dat topic muc tieu.
- Ti le hoc sinh quay lai theo kip topic tren lop.
- Ti le gap tai xuat sau mot khoang thoi gian.

### 18.3. Hieu qua giao vien

- Ti le de xuat duoc phe duyet khong can sua.
- Thoi gian giao vien dung de tao nhom va giao bai.
- Do chinh xac cua de xuat day lai ca lop.
- Ti le hoc sinh uu tien nhan can thiep va co tien bo.

## 19. Pham vi phien ban dau

Phien ban dau nen gom:

- Hai adapter evidence hien co.
- Evidence calibration co cau hinh.
- Weighted BKT theo student-topic.
- Confidence score theo cong thuc trong tai lieu.
- Reverse graph traversal va cycle validation.
- Rule-based root-cause ranking.
- Remediation subgraph va topological sort.
- Knapsack heuristic theo ngan sach.
- Draft path, phe duyet, override va versioning.
- Nhom theo root-cause topic.
- Class-wide gap va help priority co giai thich.

Chua can trong phien ban dau:

- Hoc tham so BKT rieng cho tung cau hoi.
- Integer Linear Programming.
- Tu dong hoc evidence weight.
- Mo hinh deep knowledge tracing.
- Tu dong thay doi Knowledge Graph.

## 20. Quyet dinh thiet ke da chot

- Lo trinh dau ra o muc topic kem mastery muc tieu va dieu kien chuyen tiep.
- Giao vien dat rang buoc; he thong tu tao va cap nhat trong pham vi do.
- Cho phep truy nguoc prerequisite xuyen khoi lop.
- Ket hop lich su va assessment chan doan bo sung.
- Mastery cap nhat theo evidence; cau truc path cap nhat tai checkpoint.
- Toi uu can bang giua bo sung nen tang va bat kip chuong trinh tren lop.
- Dung BKT cho mastery, khong dung BKT nhu thuat toan tao lo trinh.
- Dung graph traversal, root-cause ranking, topological sort va constrained optimization de tao path.
- Tach `confidence_score` khoi `mastery_probability`.
- Giao vien giu quyen phe duyet va override.
- Dashboard phai gom nhom theo nhu cau, chi ra ai can ho tro truoc va gap nao can day lai ca lop.
