from typing import Iterable, List, Sequence, Tuple
import numpy as np

def list2gapstr(items: Iterable) -> str:
    """Convert Python iterable into GAP pipe-delimited string with trailing bar."""
    return "|".join(map(str, items)) + "|"

def split_gap_list(value: str) -> List[str]:
    """Split a GAP pipe string 'a|b|c|' -> ['a','b','c'] handling trailing bar."""
    if not value:
        return []
    parts = value.split("|")
    return parts[:-1] if parts and parts[-1] == "" else parts

def as_float_list(value: str):
    return np.float_(split_gap_list(value))

def as_int_list(value: str):
    return np.int_(split_gap_list(value))

def as_bool_list(value: str):
    return np.bool_(split_gap_list(value))

def filter_masked(par_orig: Sequence, status: Sequence[str], mode: str):
    """
    Return only elements where status == "0".
    mode: 'float' | 'bool' | anything else (raw)
    """
    selected = []
    for idx, s in enumerate(status):
        if s == "0":
            if mode == "bool":
                selected.append(par_orig[idx] == "1")
            else:
                selected.append(par_orig[idx])
    if mode == "float":
        return np.array(selected, dtype=float)
    return selected

def update_with_mask(par_orig: List, new_values: Sequence, status: Sequence[str]) -> List:
    """Replace par_orig at positions where status == '0' with new_values in order."""
    cnt = 0
    for idx, s in enumerate(status):
        if s == "0":
            par_orig[idx] = new_values[cnt]
            cnt += 1
    return par_orig