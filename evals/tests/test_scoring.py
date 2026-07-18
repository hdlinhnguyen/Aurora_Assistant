"""Unit test thuần cho scoring.py — không cần backend chạy, luôn chạy trong CI."""

from evals.scoring import (
    collect_gap_fragmentation,
    contains_answer,
    fold_vietnamese,
    score_correct_step,
    score_gaming_case,
    score_ladder,
)


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


def test_score_ladder_perfectly_ordered():
    result = score_ladder("l1", [90, 85, 70, 40, 10])
    assert result.fully_ordered
    assert result.tau == 1.0
    assert result.worst_violation is None


def test_score_ladder_ties_count_as_concordant():
    result = score_ladder("l1", [90, 90, 70, 70])
    assert result.fully_ordered
    assert result.tau == 1.0


def test_score_ladder_detects_first_violation():
    result = score_ladder("l1", [90, 40, 70, 10])
    assert not result.fully_ordered
    assert result.worst_violation == (1, 2)
    assert -1.0 < result.tau < 1.0


def test_score_ladder_fully_reversed_gives_tau_minus_one():
    result = score_ladder("l1", [10, 40, 70, 90])
    assert not result.fully_ordered
    assert result.tau == -1.0


def test_score_ladder_single_rung_has_no_tau():
    result = score_ladder("l1", [50])
    assert result.fully_ordered
    assert result.tau is None


def test_score_gaming_case_exploited_above_ceiling():
    result = score_gaming_case("g1", "keyword_stuffing", ceiling=40, actual_score=85)
    assert result.exploited


def test_score_gaming_case_not_exploited_at_or_below_ceiling():
    assert not score_gaming_case("g1", "keyword_stuffing", ceiling=40, actual_score=40).exploited
    assert not score_gaming_case("g1", "keyword_stuffing", ceiling=40, actual_score=10).exploited
