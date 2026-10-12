import { useEffect, useState } from "react";
import { Form, Modal } from "react-bootstrap";
import { FaSliders, FaXmark } from "react-icons/fa6";
import { REFRESH_OPTIONS, useSettings } from "../../context/SettingsContext";
import { playAlertSound } from "../../utils/alertSound";

export default function QuickSettingsModal({ show, onHide }) {
  const { settings, updateSettings } = useSettings();
  const [draft, setDraft] = useState(settings);

  // บันทึกค่าเดิม
  useEffect(() => {
    if (show) setDraft(settings);
  }, [show, settings]);

  // เสียง
  const apply = () => {
    updateSettings(draft);
    if (draft.soundAlert) playAlertSound(); 
    onHide();
  };

  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      dialogClassName="qs-dialog"
      contentClassName="qs-content"
      data-bs-theme="dark"
    >
      <div className="qs-header">
        <h5 className="qs-title">
          <FaSliders /> Quick System Settings
        </h5>
        <button className="qs-close" onClick={onHide} aria-label="ปิด">
          <FaXmark />
        </button>
      </div>

      <div className="qs-body">
        <div className="qs-row">
          <label htmlFor="qs-rate">Auto-Refresh Interval</label>
          <Form.Select
            id="qs-rate"
            size="sm"
            className="qs-select"
            value={draft.refreshSeconds}
            onChange={(e) => setDraft({ ...draft, refreshSeconds: Number(e.target.value) })}
          >
            {REFRESH_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s} seconds
              </option>
            ))}
          </Form.Select>
        </div>

        <div className="qs-row">
          <label htmlFor="qs-sound">Push Sound Alert</label>
          <Form.Check
            id="qs-sound"
            checked={draft.soundAlert}
            onChange={(e) => setDraft({ ...draft, soundAlert: e.target.checked })}
          />
        </div>

        <button className="qs-apply" onClick={apply}>
          Apply Settings
        </button>
      </div>
    </Modal>
  );
}
