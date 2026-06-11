package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.NoteRespCreateDTO;
import com.hranalytics.hrbackend.dto.NoteRespUpdateDTO;
import com.hranalytics.hrbackend.entity.NoteResp;
import com.hranalytics.hrbackend.security.AuthenticatedUser;
import com.hranalytics.hrbackend.security.SecurityUtils;
import com.hranalytics.hrbackend.service.NoteRespService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/notes")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class NoteRespController {

    private final NoteRespService noteRespService;

    public NoteRespController(NoteRespService noteRespService) {
        this.noteRespService = noteRespService;
    }

    @GetMapping
    public List<NoteResp> getAll() {
        AuthenticatedUser user = SecurityUtils.requireAuthenticated();
        return noteRespService.getForAuthenticatedUser(user);
    }

    @PostMapping
    public ResponseEntity<NoteResp> create(@RequestBody NoteRespCreateDTO dto) {
        AuthenticatedUser user = SecurityUtils.requireAuthenticated();
        NoteResp created = noteRespService.create(dto, user);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    public ResponseEntity<NoteResp> update(@PathVariable Long id,
                                           @RequestBody NoteRespUpdateDTO dto) {
        AuthenticatedUser user = SecurityUtils.requireAuthenticated();
        NoteResp updated = noteRespService.update(id, dto, user);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        AuthenticatedUser user = SecurityUtils.requireAuthenticated();
        noteRespService.delete(id, user);
        return ResponseEntity.noContent().build();
    }
}
