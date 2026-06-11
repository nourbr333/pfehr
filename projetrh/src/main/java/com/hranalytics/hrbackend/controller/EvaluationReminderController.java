package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.EvaluationReminderDTO;
import com.hranalytics.hrbackend.service.EvaluationReminderService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/evaluations/reminders")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class EvaluationReminderController {

    private final EvaluationReminderService reminderService;

    public EvaluationReminderController(EvaluationReminderService reminderService) {
        this.reminderService = reminderService;
    }

    /**
     * POST /api/evaluations/reminders/{employeeId}
     * Creates a relance_eval notification for the given employee's manager.
     */
    @PostMapping("/{employeeId}")
    public ResponseEntity<EvaluationReminderDTO> sendReminder(@PathVariable Integer employeeId) {
        EvaluationReminderDTO result = reminderService.sendReminder(employeeId);
        return ResponseEntity.ok(result);
    }

    /**
     * GET /api/evaluations/reminders
     * Returns the full history of sent reminders (relance_eval notifications).
     */
    @GetMapping
    public List<EvaluationReminderDTO> getHistory() {
        return reminderService.getHistory();
    }
}
