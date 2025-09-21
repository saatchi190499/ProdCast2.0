from typing import Iterable, List
from .server import PetexServer
from .utils import split_gap_list

# --- Well/pipe mask ops ------------------------------------------------------
def mask_pipe_names(srv: PetexServer, names: Iterable[str]) -> None:
    for p in names:
        srv.do_cmd(f"GAP.MOD[{{PROD}}].PIPE[{{{p}}}].MASK()")

def unmask_pipe_names(srv: PetexServer, names: Iterable[str]) -> None:
    for p in names:
        srv.do_cmd(f"GAP.MOD[{{PROD}}].PIPE[{{{p}}}].UNMASK()")

def unmask_pipe_ids(srv: PetexServer, ids: Iterable[int]) -> None:
    for pid in ids:
        srv.do_cmd(f"GAP.MOD[{{PROD}}].PIPE[{pid}].UNMASK()")

def set_pipes(srv: PetexServer, close_names: Iterable[str], open_names: Iterable[str]) -> None:
    mask_pipe_names(srv, close_names)
    unmask_pipe_names(srv, open_names)

def set_well_mask(srv: PetexServer, well_name: str, masked: bool) -> None:
    action = "MASK" if masked else "UNMASK"
    srv.do_cmd(f"GAP.MOD[{{PROD}}].WELL[{{{well_name}}}].{action}()")

# --- Units (separators) ------------------------------------------------------

def choose_only_unit(srv: PetexServer, unit: str) -> None:
    srv.do_cmd("GAP.MOD[{PROD}].SEP[$].MASK()")
    srv.do_cmd(f"GAP.MOD[{{PROD}}].SEP[{{{unit}}}].UNMASK()")

def mask_only_unit(srv: PetexServer, unit: str) -> None:
    srv.do_cmd("GAP.MOD[{PROD}].SEP[$].UNMASK()")
    srv.do_cmd(f"GAP.MOD[{{PROD}}].SEP[{{{unit}}}].MASK()")

def unmask_all_units(srv: PetexServer) -> None:
    srv.do_cmd("GAP.MOD[{PROD}].SEP[$].UNMASK()")

# --- Solver ops --------------------------------------------------------------

def solve_network(srv: PetexServer, mode: int = 0) -> None:
    """mode 0: standard; 3: rate-balance (your previous rb)."""
    srv.do_cmd(f"GAP.SOLVENETWORK({mode}, MOD[0])")

def show_interface(srv: PetexServer, show: int = 1) -> None:
    srv.do_cmd(f"GAP.SHOWINTERFACE({show})")

# --- Rates & pressures -------------------------------------------------------

def get_unit_qgas(srv: PetexServer, unit: str) -> float:
    return float(srv.get_value(f"GAP.MOD[{{PROD}}].SEP[{{{unit}}}].SolverResults[0].GasRate"))

def get_unit_qoil(srv: PetexServer, unit: str) -> float:
    return float(srv.get_value(f"GAP.MOD[{{PROD}}].SEP[{{{unit}}}].SolverResults[0].OilRate"))

def get_unit_qwat(srv: PetexServer, unit: str) -> float:
    return float(srv.get_value(f"GAP.MOD[{{PROD}}].SEP[{{{unit}}}].SolverResults[0].WatRate"))

def set_unit_pres(srv: PetexServer, unit: str, pres: float) -> None:
    srv.set_value(f"GAP.MOD[{{PROD}}].SEP[{{{unit}}}].SolverPres[0]", pres)

# --- Well choke control ------------------------------------------------------

def shut_well(srv: PetexServer, well: str) -> None:
    srv.set_value(f"GAP.MOD[{{PROD}}].WELL[{{{well}}}].DPControl", "FIXEDVALUE")
    srv.set_value(f"GAP.MOD[{{PROD}}].WELL[{{{well}}}].DPControlValue", 10000)

def open_well(srv: PetexServer, well: str) -> None:
    srv.set_value(f"GAP.MOD[{{PROD}}].WELL[{{{well}}}].DPControl", "CALCULATED")
    srv.set_value(f"GAP.MOD[{{PROD}}].WELL[{{{well}}}].DPControlValue", 0)

def set_all_chokes_calculated(srv: PetexServer) -> None:
    srv.set_value("GAP.MOD[{PROD}].WELL[$].DPControl", "CALCULATED")
    srv.set_value("GAP.MOD[{PROD}].WELL[$].DPControlValue", 0)

# --- Bulk getters ------------------------------------------------------------

def get_all(srv: PetexServer, tag: str) -> List[str]:
    return split_gap_list(srv.get_value(tag))

def get_all_float(srv: PetexServer, tag: str):
    return [float(x) for x in get_all(srv, tag)]

def get_all_int(srv: PetexServer, tag: str):
    return [int(x) for x in get_all(srv, tag)]

def get_all_bool(srv: PetexServer, tag: str):
    return [x == "1" for x in get_all(srv, tag)]

def get_float(srv: PetexServer, tag: str) -> float:
    return float(srv.get_value(tag))

# --- Other -------------------------------------------------------------------

def start_gap(srv: PetexServer):
    return srv.do_cmd("GAP.Start")

def open_gap_model(srv: PetexServer, file_path: str):
    return srv.do_cmd(f"GAP.OPENFILE('{file_path}')")

def get_all_equips(srv: PetexServer):
    """Возвращает словарь {тип: [список экземпляров]} из GAP"""
    types = get_all(srv, "GAP.MOD[0].EQUIP[$].Type")
    labels = get_all(srv, "GAP.MOD[0].EQUIP[$].Label")

    equips = {}
    for t, l in zip(types, labels):
        if not t or not str(t).strip() or not l or not str(l).strip():
            continue
        equips.setdefault(t, []).append(l)

    return equips
    
    
