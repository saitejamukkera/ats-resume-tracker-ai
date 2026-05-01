package com.fullstack.ATSJobTracker.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.csrf.CsrfTokenRequestHandler;
import org.springframework.util.StringUtils;

import java.util.function.Supplier;

public class SpaCsrfTokenRequestHandler implements CsrfTokenRequestHandler {

    private final CsrfTokenRequestAttributeHandler delegate = new CsrfTokenRequestAttributeHandler();

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
                       Supplier<CsrfToken> deferredCsrfToken) {
        delegate.handle(request, response, deferredCsrfToken);
    }

    @Override
    public String resolveCsrfTokenValue(HttpServletRequest request, CsrfToken csrfToken) {
        String headerValue = request.getHeader(csrfToken.getHeaderName());
        if (StringUtils.hasText(headerValue)) {
            return headerValue;
        }
        return delegate.resolveCsrfTokenValue(request, csrfToken);
    }
}
