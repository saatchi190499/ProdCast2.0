from typing import Iterable, List
from .server import PetexServer
from .utils import split_gap_list

# --- Well/pipe mask ops ------------------------------------------------------
def mask_pipe_names(srv: PetexServer, names: Iterable[str]) -> None:
    """Masks (closes) all pipes by their names in the GAP model."""

    for p in names:
        srv.do_cmd(f"GAP.MOD[{{PROD}}].PIPE[{{{p}}}].MASK()")

def unmask_pipe_names(srv: PetexServer, names: Iterable[str]) -> None:
    """Unmasks (opens) all pipes by their names in the GAP model."""

    for p in names:
        srv.do_cmd(f"GAP.MOD[{{PROD}}].PIPE[{{{p}}}].UNMASK()")

def unmask_pipe_ids(srv: PetexServer, ids: Iterable[int]) -> None:
    """Unmasks (opens) all pipes by their numeric IDs in the GAP model."""

    for pid in ids:
        srv.do_cmd(f"GAP.MOD[{{PROD}}].PIPE[{pid}].UNMASK()")

def set_pipes(srv: PetexServer, close_names: Iterable[str], open_names: Iterable[str]) -> None:
    """Masks (closes) the given pipes and unmasks (opens) the given pipes in one call."""

    mask_pipe_names(srv, close_names)
    unmask_pipe_names(srv, open_names)

def set_well_mask(srv: PetexServer, well_name: str, masked: bool) -> None:
    """Masks or unmasks a well depending on the `masked` flag."""

    action = "MASK" if masked else "UNMASK"
    srv.do_cmd(f"GAP.MOD[{{PROD}}].WELL[{{{well_name}}}].{action}()")

# --- Units (separators) ------------------------------------------------------

def choose_only_unit(srv: PetexServer, unit: str) -> None:
    """Masks all separators and unmasks only the given separator."""

    srv.do_cmd("GAP.MOD[{PROD}].SEP[$].MASK()")
    srv.do_cmd(f"GAP.MOD[{{PROD}}].SEP[{{{unit}}}].UNMASK()")

def mask_only_unit(srv: PetexServer, unit: str) -> None:
    """Unmasks all separators and masks only the given separator."""

    srv.do_cmd("GAP.MOD[{PROD}].SEP[$].UNMASK()")
    srv.do_cmd(f"GAP.MOD[{{PROD}}].SEP[{{{unit}}}].MASK()")

def unmask_all_units(srv: PetexServer) -> None:
    """Unmasks (opens) all separators in the GAP model."""

    srv.do_cmd("GAP.MOD[{PROD}].SEP[$].UNMASK()")

# --- Solver ops --------------------------------------------------------------

def solve_network(srv: PetexServer, mode: int = 0) -> None:
    """Solves the network. Mode 0 = standard, Mode 3 = rate-balance."""

    srv.do_cmd(f"GAP.SOLVENETWORK({mode}, MOD[0])")

def show_interface(srv: PetexServer, show: int = 1) -> None:
    """Shows or hides the GAP graphical interface (1 = show, 0 = hide)."""

    srv.do_cmd(f"GAP.SHOWINTERFACE({show})")

# --- Rates & pressures -------------------------------------------------------

def get_unit_qgas(srv: PetexServer, unit: str) -> float:
    """Returns the gas production rate for the given separator unit."""

    return float(srv.get_value(f"GAP.MOD[{{PROD}}].SEP[{{{unit}}}].SolverResults[0].GasRate"))

def get_unit_qoil(srv: PetexServer, unit: str) -> float:
    """Returns the oil production rate for the given separator unit."""

    return float(srv.get_value(f"GAP.MOD[{{PROD}}].SEP[{{{unit}}}].SolverResults[0].OilRate"))

def get_unit_qwat(srv: PetexServer, unit: str) -> float:
    """Returns the water production rate for the given separator unit."""

    return float(srv.get_value(f"GAP.MOD[{{PROD}}].SEP[{{{unit}}}].SolverResults[0].WatRate"))

def set_unit_pres(srv: PetexServer, unit: str, pres: float) -> None:
    """Sets the pressure for the given separator unit."""

    srv.set_value(f"GAP.MOD[{{PROD}}].SEP[{{{unit}}}].SolverPres[0]", pres)

# --- Well choke control ------------------------------------------------------

def shut_well(srv: PetexServer, well: str) -> None:
    """Shuts a well by fixing its DPControl to a high choke pressure."""

    srv.set_value(f"GAP.MOD[{{PROD}}].WELL[{{{well}}}].DPControl", "FIXEDVALUE")
    srv.set_value(f"GAP.MOD[{{PROD}}].WELL[{{{well}}}].DPControlValue", 10000)

def open_well(srv: PetexServer, well: str) -> None:
    """Opens a well by setting its DPControl to calculated mode."""

    srv.set_value(f"GAP.MOD[{{PROD}}].WELL[{{{well}}}].DPControl", "CALCULATED")
    srv.set_value(f"GAP.MOD[{{PROD}}].WELL[{{{well}}}].DPControlValue", 0)

def set_all_chokes_calculated(srv: PetexServer) -> None:
    """Sets all wells to calculated DPControl mode (fully open)."""

    srv.set_value("GAP.MOD[{PROD}].WELL[$].DPControl", "CALCULATED")
    srv.set_value("GAP.MOD[{PROD}].WELL[$].DPControlValue", 0)

# --- Bulk getters ------------------------------------------------------------

def get_all(srv: PetexServer, tag: str) -> List[str]:
    """Returns a list of all values for the given GAP tag."""

    return split_gap_list(srv.get_value(tag))

def get_all_float(srv: PetexServer, tag: str):
    """Returns all values for the given GAP tag as floats."""

    return [float(x) for x in get_all(srv, tag)]

def get_all_int(srv: PetexServer, tag: str):
    """Returns all values for the given GAP tag as integers."""

    return [int(x) for x in get_all(srv, tag)]

def get_all_bool(srv: PetexServer, tag: str):
    """Returns all values for the given GAP tag as booleans (True if '1')."""

    return [x == "1" for x in get_all(srv, tag)]

def get_float(srv: PetexServer, tag: str) -> float:
    """Returns a single GAP tag value as float."""

    return float(srv.get_value(tag))

# --- Other -------------------------------------------------------------------

def start_gap(srv: PetexServer):
    """Starts the GAP application."""

    return srv.do_cmd("GAP.Start")

def close(srv: PetexServer):
    """Shuts down the GAP application."""

    return srv.do_cmd("GAP.SHUTDOWN")

def open_gap_model(srv: PetexServer, file_path: str):
    """Opens a GAP model file by file path."""

    return srv.do_cmd(f"GAP.OPENFILE('{file_path}')")

def get_all_equips(srv: PetexServer):
    """Returns a dictionary {equipment_type: [labels]} for all equipments in the GAP model."""

    types = get_all(srv, "GAP.MOD[0].EQUIP[$].Type")
    labels = get_all(srv, "GAP.MOD[0].EQUIP[$].Label")

    equips = {}
    for t, l in zip(types, labels):
        if not t or not str(t).strip() or not l or not str(l).strip():
            continue
        equips.setdefault(t, []).append(l)

    return equips