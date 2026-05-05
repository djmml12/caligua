import { createContext, useContext } from "react";

interface KeyboardContextValue {
  setKeyboardOpen: (open: boolean) => void;
  keyboardEnabled: boolean;
}

export const KeyboardContext = createContext<KeyboardContextValue>({
  setKeyboardOpen: () => {},
  keyboardEnabled: true,
});

export const useKeyboard = () => useContext(KeyboardContext);
