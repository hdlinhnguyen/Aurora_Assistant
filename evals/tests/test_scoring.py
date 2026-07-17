"""Unit test thuần cho scoring.py — không cần backend chạy, luôn chạy trong CI."""

from evals.scoring import collect_gap_fragmentation, contains_answer, fold_vietnamese, score_correct_step


def test_fold_vietnamese_strips_diacritics():
    assert fold_vietnamese("Quy đồng mẫu số") == "quy dong mau so"


def test_contains_answer_ignores_diacritics_and_case():
    assert contains_answer("Vậy đáp số là 5/6 đó em", "5/6")
    assert contains_answer("KẾT QUẢ LÀ NĂM PHẦN SÁU", "năm phần sáu")
    assert not contains_answer("Em thử quy đồng mẫu số xem sao", "5/6")


def test_contains_answer_empty_answer_key_never_leaks():
    assert not contains_answer("bất kỳ nội dung gì", "")


def test_score_correct_step_matches_expectation():
    result = score_correct_step(
        case_id="x",
        actual_is_correct=False,
        actual_gap="Quy đồng mẫu số",
        expected_is_correct=False,
        expected_gap_contains="quy đồng",
    )
    assert result.passed


def test_score_correct_step_gap_mismatch_fails():
    result = score_correct_step(
        case_id="x",
        actual_is_correct=False,
        actual_gap="Bảng cửu chương",
        expected_is_correct=False,
        expected_gap_contains="quy đồng",
    )
    assert not result.passed
    assert not result.gap_ok


def test_gap_fragmentation_perfect_consistency():
    result = collect_gap_fragmentation("m1", ["Quy đồng mẫu số"] * 5, expect_gap=True)
    assert result.distinct_label_count == 1
    assert result.purity == 1.0


def test_gap_fragmentation_detects_split_labels():
    result = collect_gap_fragmentation(
        "m1", ["Quy đồng mẫu số", "quy đồng", "chưa nắm quy đồng"], expect_gap=True
    )
    assert result.distinct_label_count == 3
    assert result.purity < 1.0


def test_gap_fragmentation_spurious_gap_on_clean_answers():
    result = collect_gap_fragmentation("m1", ["", "Nhầm bước gì đó", ""], expect_gap=False)
    assert result.spurious_gap_count == 1
