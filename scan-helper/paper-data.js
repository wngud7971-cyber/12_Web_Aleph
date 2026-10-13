globalThis.PAPER_DATA = {
  "title": "선택도에 따른 인덱스 스캔과 순차 스캔의 성능 비교",
  "rows": [
    {
      "selectivity": 0.1,
      "seq": 39.61,
      "seqSd": 0.41,
      "index": 0.65,
      "indexSd": 0.06,
      "n": 10,
      "label": "인덱스 우위",
      "source": "표 3 · 원 실험"
    },
    {
      "selectivity": 1.0,
      "seq": 43.17,
      "seqSd": 4.5,
      "index": 3.98,
      "indexSd": 0.75,
      "n": 10,
      "label": "인덱스 우위",
      "source": "표 3 · 원 실험"
    },
    {
      "selectivity": 10.0,
      "seq": 45.94,
      "seqSd": 1.54,
      "index": 15.55,
      "indexSd": 0.3,
      "n": 10,
      "label": "인덱스 우위",
      "source": "표 3 · 원 실험"
    },
    {
      "selectivity": 20.0,
      "seq": 49.89,
      "seqSd": 3.35,
      "index": 27.17,
      "indexSd": 7.57,
      "n": 10,
      "label": "인덱스 우위",
      "source": "표 3 · 원 실험"
    },
    {
      "selectivity": 30.0,
      "seq": 53.27,
      "seqSd": 2.58,
      "index": 27.25,
      "indexSd": 1.62,
      "n": 10,
      "label": "인덱스 우위",
      "source": "표 3 · 원 실험"
    },
    {
      "selectivity": 40.0,
      "seq": 58.84,
      "seqSd": 3.64,
      "index": 32.63,
      "indexSd": 2.65,
      "n": 10,
      "label": "인덱스 우위",
      "source": "표 3 · 원 실험"
    },
    {
      "selectivity": 50.0,
      "seq": 67.38,
      "seqSd": 3.79,
      "index": 37.8,
      "indexSd": 1.49,
      "n": 10,
      "label": "인덱스 우위",
      "source": "표 3 · 원 실험"
    },
    {
      "selectivity": 60.0,
      "seq": 70.62,
      "seqSd": 4.88,
      "index": 49.44,
      "indexSd": 10.31,
      "n": 10,
      "label": "인덱스 우위",
      "source": "표 3 · 원 실험"
    },
    {
      "selectivity": 70.0,
      "seq": 72.55,
      "seqSd": 3.6,
      "index": 56.94,
      "indexSd": 9.99,
      "n": 10,
      "label": "인덱스 우위",
      "source": "표 3 · 원 실험"
    },
    {
      "selectivity": 80.0,
      "seq": 79.06,
      "seqSd": 14.16,
      "index": 67.88,
      "indexSd": 15.0,
      "n": 10,
      "label": "우위 불분명",
      "source": "표 3 · 원 실험"
    },
    {
      "selectivity": 90.0,
      "seq": 77.76,
      "seqSd": 9.33,
      "index": 63.74,
      "indexSd": 5.38,
      "n": 10,
      "label": "인덱스 우위",
      "source": "표 3 · 원 실험"
    },
    {
      "selectivity": 95.0,
      "seq": 86.81,
      "seqSd": 4.62,
      "index": 66.38,
      "indexSd": 6.04,
      "n": 10,
      "label": "인덱스 우위",
      "source": "표 3 · 정리 후 추가 실험"
    },
    {
      "selectivity": 99.0,
      "seq": 87.99,
      "seqSd": 3.35,
      "index": 74.47,
      "indexSd": 19.35,
      "n": 10,
      "label": "인덱스 우위",
      "source": "표 3 · 정리 후 추가 실험"
    },
    {
      "selectivity": 99.9,
      "seq": 96.76,
      "seqSd": 12.36,
      "index": 70.03,
      "indexSd": 7.11,
      "n": 10,
      "label": "인덱스 우위",
      "source": "표 3 · 정리 후 추가 실험"
    },
    {
      "selectivity": 100.0,
      "seq": 92.58,
      "seqSd": 5.68,
      "index": 74.44,
      "indexSd": 9.49,
      "n": 10,
      "label": "인덱스 우위",
      "source": "표 3 · 정리 후 추가 실험"
    },
    {
      "selectivity": 80,
      "seq": 107.75,
      "seqSd": 17.42,
      "index": 99.05,
      "indexSd": 45.36,
      "n": 30,
      "label": "우위 불분명",
      "source": "표 6 · 80% 추가 측정 (별도 실행)"
    }
  ],
  "source": "논문 표 3·6의 공개 요약 통계. 원자료가 아니라 반올림된 평균과 표본 표준편차입니다.",
  "environment": "PostgreSQL 18.6 · 100만 행 · 로컬 실험 · 병렬 실행/JIT 끔"
};
