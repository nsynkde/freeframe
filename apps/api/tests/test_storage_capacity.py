from apps.api.services.s3_service import _parse_capacity_metrics

SAMPLE = """# HELP minio_cluster_capacity_usable_free_bytes Total free usable space
# TYPE minio_cluster_capacity_usable_free_bytes gauge
minio_cluster_capacity_usable_free_bytes{server="127.0.0.1:9000"} 7.5e+11
minio_cluster_capacity_usable_total_bytes{server="127.0.0.1:9000"} 1e+12
minio_cluster_capacity_raw_free_bytes{server="127.0.0.1:9000"} 1
"""


def test_parse_capacity_metrics():
    assert _parse_capacity_metrics(SAMPLE) == {"free_bytes": 750_000_000_000, "total_bytes": 1_000_000_000_000}
    assert _parse_capacity_metrics("# nothing\n") is None
