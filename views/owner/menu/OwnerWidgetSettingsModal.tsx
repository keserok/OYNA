import React from 'react';
import { OwnerCenteredModal } from './OwnerModalFrame';
import { OWNER_WIDGETS, type WidgetType } from './ownerMenuTypes';

interface Props {
  onClose: () => void;
  activeWidgets: WidgetType[];
  onToggleWidget: (widget: WidgetType) => void;
}

export const OwnerWidgetSettingsModal: React.FC<Props> = ({
  onClose,
  activeWidgets,
  onToggleWidget,
}) => (
  <OwnerCenteredModal title="Özet Widgetları" onClose={onClose}>
    <div className="space-y-4">
      {OWNER_WIDGETS.map((widget) => {
        const isActive = activeWidgets.includes(widget.id);
        const Icon = widget.icon;
        return (
          <div
            key={widget.id}
            className="bg-[#0A0E14] border border-white/5 p-4 rounded-2xl flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  isActive ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-gray-500'
                }`}
              >
                <Icon size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">{widget.title}</h4>
                <p className="text-[10px] text-gray-500">{widget.description}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onToggleWidget(widget.id)}
              className={`w-12 h-6 rounded-full relative transition-colors ${
                isActive ? 'bg-blue-600' : 'bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                  isActive ? 'right-1' : 'left-1'
                }`}
              />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onClose}
        className="w-full h-12 mt-2 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500"
      >
        Tamam
      </button>
    </div>
  </OwnerCenteredModal>
);
