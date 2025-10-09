import { useEffect, useState } from "react";
import api from "../../utils/axiosInstance";

// Custom hook to fetch branches for wells from GapNetworkData
export default function useWellBranches() {
  const [wellBranches, setWellBranches] = useState({});
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [errorBranches, setErrorBranches] = useState(null);

  useEffect(() => {
    api.get("/gap-network-data/")
      .then(res => {
        // res.data should be an array of GapNetworkData objects
        // { well_uid, branches }
        const map = {};
        res.data.forEach(item => {
          // branches is an object: { branch_point_uid: [pipe_dicts] }
          // For dropdown, collect all branch pipe labels (already filtered by backend)
          const branchNames = Object.values(item.branches || {})
            .flat()
            .map(pipe => pipe.label || pipe.uid || String(pipe));
          map[item.well_name] = branchNames;
        });
        setWellBranches(map);
        setLoadingBranches(false);
      })
      .catch(err => {
        setErrorBranches(err.message);
        setLoadingBranches(false);
      });
  }, []);

  return { wellBranches, loadingBranches, errorBranches };
}
