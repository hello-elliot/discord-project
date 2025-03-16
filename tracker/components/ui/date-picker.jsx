import * as React from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay } from "date-fns";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"; // Updated import

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function DatePicker({ className, value, onChange, ...props }) {
  const [selectedDate, setSelectedDate] = React.useState(value || null);
  const [currentMonth, setCurrentMonth] = React.useState(value ? new Date(value) : new Date());

  React.useEffect(() => {
    setSelectedDate(value);
    if (value) setCurrentMonth(new Date(value));
  }, [value]);

  const handleSelect = (day) => {
    setSelectedDate(day);
    if (onChange && typeof onChange === "function") {
      onChange(day);
    }
  };

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() - 1);
      return newDate;
    });
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + 1);
      return newDate;
    });
  };

  const renderDaysOfWeek = () => (
    <div className="grid grid-cols-7 text-center text-sm font-medium text-zinc-600 mb-2">
      {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
        <div key={day} className="w-9 h-9 flex items-center justify-center">
          {day}
        </div>
      ))}
    </div>
  );

  const renderCalendar = () => {
    const firstDayOfMonth = getDay(startOfMonth(currentMonth));
    const daysArray = Array(firstDayOfMonth).fill(null).concat(days);

    return (
      <div className="grid grid-cols-7 gap-1">
        {daysArray.map((day, index) => (
          <div
            key={index}
            className={cn(
              "w-9 h-9 flex items-center justify-center rounded-full text-sm cursor-pointer hover:bg-zinc-100",
              isSameDay(day, selectedDate) && "bg-zinc-200 text-zinc-900",
              !day && "text-transparent",
              day && isSameDay(day, new Date()) && "border-2 border-zinc-500"
            )}
            onClick={() => day && handleSelect(day)}
          >
            {day ? day.getDate() : ""}
          </div>
        ))}
      </div>
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-[280px] justify-start text-left font-normal",
            !selectedDate && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2 bg-white">
        <div className="flex justify-between items-center mb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevMonth}
            className="text-zinc-500 hover:text-zinc-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-zinc-700">
            {format(currentMonth, "MMMM yyyy")}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNextMonth}
            className="text-zinc-500 hover:text-zinc-700"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {renderDaysOfWeek()}
        {renderCalendar()}
      </PopoverContent>
    </Popover>
  );
}