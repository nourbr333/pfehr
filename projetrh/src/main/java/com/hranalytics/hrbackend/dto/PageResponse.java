package com.hranalytics.hrbackend.dto;

import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;

/**
 * Standard paginated API response used by list endpoints.
 */
public class PageResponse<T> {

    private List<T> content;
    private long totalElements;
    private int totalPages;
    private int page;
    private int size;
    /** Optional facet counts (e.g. admin log tabs). */
    private Map<String, Long> tabCounts;

    public PageResponse() {
    }

    public PageResponse(List<T> content, long totalElements, int totalPages, int page, int size) {
        this.content = content;
        this.totalElements = totalElements;
        this.totalPages = totalPages;
        this.page = page;
        this.size = size;
    }

    public static <T> PageResponse<T> from(Page<T> springPage) {
        PageResponse<T> response = new PageResponse<>(
                springPage.getContent(),
                springPage.getTotalElements(),
                springPage.getTotalPages(),
                springPage.getNumber(),
                springPage.getSize()
        );
        return response;
    }

    public static <T> PageResponse<T> unpaged(List<T> all) {
        int size = all.size();
        return new PageResponse<>(all, size, size == 0 ? 0 : 1, 0, size);
    }

    public List<T> getContent() {
        return content;
    }

    public void setContent(List<T> content) {
        this.content = content;
    }

    public long getTotalElements() {
        return totalElements;
    }

    public void setTotalElements(long totalElements) {
        this.totalElements = totalElements;
    }

    public int getTotalPages() {
        return totalPages;
    }

    public void setTotalPages(int totalPages) {
        this.totalPages = totalPages;
    }

    public int getPage() {
        return page;
    }

    public void setPage(int page) {
        this.page = page;
    }

    public int getSize() {
        return size;
    }

    public void setSize(int size) {
        this.size = size;
    }

    public Map<String, Long> getTabCounts() {
        return tabCounts;
    }

    public void setTabCounts(Map<String, Long> tabCounts) {
        this.tabCounts = tabCounts;
    }
}
