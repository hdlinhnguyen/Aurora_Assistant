# Thiet ke tu dong goi y lo trinh hoc ca nhan hoa

## Muc tieu

Khi giao vien mo tab lap lo trinh, he thong tu dong de xuat toi da ba topic muc tieu va nam hoc sinh can ho tro nhat trong lop duy nhat cua giao vien. Giao vien co the dieu chinh topic, hoc sinh va tung buoc trong lo trinh, sau do phai phe duyet truoc khi hoc sinh nhin thay.

## Nguyen tac nghiep vu

- He thong de xuat ca topic muc tieu va hoc sinh; giao vien la nguoi xac nhan lua chon.
- Hoc sinh thieu evidence hoac confidence thap khong bi gan nhan yeu. Cac em nam trong danh sach can chan doan bo sung.
- Preview va Draft chi hien thi cho giao vien.
- Hoc sinh chi doc duoc lo trinh da luu voi trang thai `Approved`.
- Backend tu xac dinh lop duy nhat thuoc giao vien dang dang nhap. Frontend khong duoc tu chon `teacher_id` hoac gui mot lop khong thuoc giao vien.
- Bo hoan toan fallback email demo va `class-demo` khoi luong tao/duyet lo trinh.

## Kien truc

Them endpoint `GET /api/teacher/learning-path/suggestions`. Endpoint lay hoc sinh trong lop cua giao vien, thu thap evidence, tinh weighted BKT theo tung cap student-topic, xep hang topic co lo hong, sau do chay reverse prerequisite traversal cho cac topic muc tieu de xep hang hoc sinh va tao preview path.

Sau khi giao vien dieu chinh de xuat, frontend goi endpoint tao Draft hien co voi `studentIds` va `targetTopicIds` ro rang. Endpoint duyet xac minh quyen so huu thread/lop, luu snapshot giao vien da sua thanh `Approved`, va chi luc do endpoint hoc sinh moi tra ve lo trinh.

## Thuat toan de xuat topic

Chi cac state co confidence dat nguong moi tham gia ket luan. Voi moi topic:

```text
topic_suggestion_score =
    confirmed_gap_rate
  * average_mastery_deficit
  * average_confidence
  * normalized_downstream_impact
```

Trong do:

- `confirmed_gap_rate` la ty le hoc sinh `confirmed_gap` tren so hoc sinh co du confidence.
- `average_mastery_deficit` la trung binh `1 - mastery_probability` cua nhom gap.
- `average_confidence` la confidence trung binh cua nhom gap.
- `normalized_downstream_impact` la `(1 + so hau due) / (1 + so topic trong graph)`.

He thong chon toi da ba topic co diem cao nhat. Neu hai topic nam tren cung mot nhanh prerequisite va co gan cung tap hoc sinh gap, uu tien topic phia sau lam muc tieu; topic phia truoc se xuat hien trong remediation path. Sap xep phu theo `topic_id` de ket qua tat dinh.

## Thuat toan de xuat hoc sinh va lo trinh

Voi tap topic muc tieu:

```text
RelevantSubgraph = ancestors(target_topics) + target_topics
```

Tren graph con nay, he thong tai su dung cong thuc hien co:

```text
gap_score =
    mastery_deficit
  * diagnostic_confidence
  * target_relevance
  * downstream_impact
```

Root-cause la `confirmed_gap` som nhat tren nhanh ma khong co ancestor nao cung la `confirmed_gap`. `help_priority` cua hoc sinh la `gap_score` cua root-cause hang dau. He thong chon toi da nam hoc sinh; khi bang diem, uu tien hoc sinh co nhieu target bi chan hon, sau do sap theo `student_id`.

Preview path gom root-cause, cac topic trung gian chua vung va topic muc tieu. Topic da mastered khong tro thanh buoc hoc. Cac buoc duoc sap theo topological order, bao toan moi prerequisite bat buoc. Khong dung shortest path don vi mot topic co the co nhieu prerequisite dong thoi.

## Hop dong API preview

`GET /api/teacher/learning-path/suggestions` tra:

```json
{
  "class_id": "uuid",
  "suggested_topics": [
    {
      "topic_id": "uuid",
      "suggestion_score": 0.42,
      "confirmed_gap_rate": 0.6,
      "gap_student_ids": ["uuid"]
    }
  ],
  "suggested_students": [
    {
      "student_id": "uuid",
      "help_priority": 1.25,
      "root_cause_topic_id": "uuid",
      "reason": "...",
      "blocked_target_count": 2
    }
  ],
  "insufficient_evidence_students": ["uuid"],
  "preview_paths": {
    "student-uuid": {}
  },
  "algorithm_version": "learning-path-suggestions-v1"
}
```

Danh sach rong la response hop le khi lop chua co evidence du tin cay.

## Luong giao dien

1. Khi tab duoc mo, frontend tai suggestions mot lan.
2. UI hien topic de xuat, toi da nam hoc sinh, root-cause, mastery/confidence, ly do va preview path.
3. Giao vien co the bo/chon lai topic va hoc sinh.
4. Nut tao Draft gui dung `studentIds` va `targetTopicIds` da chon.
5. Giao vien co the doi thu tu hoac xoa buoc trong Draft.
6. Nut duyet gui snapshot `custom_paths` da sua.
7. Sau khi backend luu `Approved`, UI xoa Draft khoi workspace va hoc sinh moi doc duoc path.

UI su dung dung ten field tu service: `confirmed_gap_rate` va `help_priority`, thay cho `gap_ratio` va `urgency_score` hien dang sai.

## Quyen truy cap va vong doi

- Endpoint suggestions, create va approve chi danh cho teacher.
- Backend xac dinh teacher tu JWT va xac minh lop thuoc teacher.
- `studentIds` phai thuoc lop; ID ngoai lop bi tu choi.
- Thread Draft phai gan voi teacher va class de endpoint approve co the xac minh quyen.
- `approve=false` khong duoc luu path `Approved`.
- Khi phe duyet, chi thay the lo trinh hien hanh cua dung student va class.
- Endpoint hoc sinh tiep tuc chi query status `Approved`.

## Xu ly ngoai le

- Khong du evidence: tra danh sach can chan doan bo sung, khong tao gap gia.
- Graph co cycle: tra `graph_validation_error`, khong tao preview path.
- Topic khong co root-cause: khong tao path cho hoc sinh do.
- Learning-path service khong san sang: tra loi co ma loi ro rang; UI giu lua chon cua giao vien de thu lai.
- Custom path vi pham prerequisite: backend tu choi phe duyet thay vi luu mot path khong hop le.
- Khong co lop hoac co nhieu hon mot lop trong pham vi tam thoi: tra loi cau hinh ro rang; khong tu chon lop ngau nhien.

## Kiem thu

- Unit test cong thuc va thu tu topic suggestion.
- Unit test loai topic trung lap tren cung nhanh.
- Unit test top nam hoc sinh va xu ly tie-break tat dinh.
- Unit test hoc sinh thieu evidence khong nam trong danh sach yeu.
- Test reverse traversal, root-cause va topological path hien co tiep tuc pass.
- API test suggestions voi lop hop le, rong evidence, sai so huu lop va graph loi.
- Handler test create chi chap nhan hoc sinh trong lop va khong dung fallback demo.
- Lifecycle test preview -> Draft -> approve -> student visibility.
- Test `approve=false` khong ghi path.
- Frontend test mapping `confirmed_gap_rate`, `help_priority`, lua chon topic/hoc sinh va payload tao Draft.

## Pham vi

Phien ban nay chi ho tro mot lop moi giao vien, toi da ba topic va nam hoc sinh de xuat. Khong them LLM, khong thay doi Knowledge Graph, khong hoc lai tham so BKT va khong tu dong giao lo trinh ma khong co phe duyet cua giao vien.
