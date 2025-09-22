// src/context/PetexTipsContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import api from "../../../utils/axiosInstance";

const PetexTipsContext = createContext(null);

export function PetexTipsProvider({ children }) {
  const [tips, setTips] = useState({});
  const [loading, setLoading] = useState(false);

  const fetchTips = async () => {
    try {
      setLoading(true);
      const [petexRes, varsRes] = await Promise.all([
        api.get("/petex/introspect/"),
        api.get("/variables/"),
      ]);

      const petexTips = petexRes.data || {};
      const userVars = varsRes.data || {};

      const variableEntries = {};
      Object.entries(userVars).forEach(([name, info]) => {
        variableEntries[name] = {
          kind: "variable",
          signature: `${name}: ${info.type}`,
          doc: `Value: ${info.preview}`,
        };
      });

      setTips({
        ...petexTips,
        __variables__: { ...variableEntries },
      });
    } finally {
      setLoading(false);
    }
  };

  // Helpers
  const addOrUpdateVar = (name, info) => {
    setTips((prev) => ({
      ...prev,
      __variables__: {
        ...(prev.__variables__ || {}),
        [name]: {
          kind: "variable",
          signature: `${name}: ${info.type}`,
          doc: `Value: ${info.preview}`,
        },
      },
    }));
  };

  const deleteVar = (name) => {
    setTips((prev) => {
      const copy = { ...(prev.__variables__ || {}) };
      delete copy[name];
      return { ...prev, __variables__: copy };
    });
  };

  useEffect(() => {
    fetchTips();
  }, []);

  return (
    <PetexTipsContext.Provider value={{ tips, addOrUpdateVar, deleteVar, refreshTips: fetchTips }}>
      {children}
    </PetexTipsContext.Provider>
  );
}

export function usePetexTips() {
  return useContext(PetexTipsContext);
}
